data "aws_caller_identity" "current" {}

locals {
  alb_services = {
    for name, svc in var.services : name => {
      priority      = svc.priority
      path_patterns = svc.path_patterns
      health_check  = svc.health_check
      port          = svc.container_port
    }
  }

  reviews_bucket_name = lower(replace("${var.name_prefix}-reviews", "_", "-"))
  reviews_bucket_arn  = "arn:aws:s3:::${local.reviews_bucket_name}"
  reviews_table_name  = "${var.name_prefix}-reviews"
  reviews_table_arn   = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.reviews_table_name}"
  enable_bastion = var.enable_bastion
  private_subnet_keys = toset([
    for idx, _ in var.private_subnet_cidrs : substr(var.azs[idx], length(var.azs[idx]) - 1, 1)
  ])

  db_env_node = {
    DB_TYPE     = "mysql"
    DB_HOST     = module.rds.endpoint
    DB_PORT     = tostring(module.rds.port)
    DB_USER     = module.rds.username
    DB_PASSWORD = var.db_password
    DB_NAME     = "ecommerce_node"
  }

  db_env_python = {
    DB_TYPE     = "mysql"
    DB_HOST     = module.rds.endpoint
    DB_PORT     = tostring(module.rds.port)
    DB_USER     = module.rds.username
    DB_PASSWORD = var.db_password
    DB_NAME     = "ecommerce_python"
  }

  db_env_spring = {
    SPRING_DATASOURCE_URL      = "jdbc:mysql://${module.rds.endpoint}:${module.rds.port}/ecommerce_spring?useSSL=false&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true"
    SPRING_DATASOURCE_USERNAME = module.rds.username
    SPRING_DATASOURCE_PASSWORD = var.db_password
  }

  reviews_env_node = {
    STORAGE_TYPE    = "s3"
    S3_BUCKET       = local.reviews_bucket_name
    S3_REGION       = var.aws_region
    REVIEW_STORE    = "dynamodb"
    DYNAMODB_TABLE  = local.reviews_table_name
    DYNAMODB_REGION = var.aws_region
  }

  service_db_envs = {
    "api-node"   = merge(local.db_env_node, local.reviews_env_node)
    "api-python" = local.db_env_python
    "api-spring" = local.db_env_spring
    "frontend"   = {}
  }

  ecs_services = {
    for name, svc in var.services : name => {
      cpu            = svc.cpu
      memory         = svc.memory
      container_port = svc.container_port
      desired_count  = svc.desired_count
      image          = svc.image
      environment = name == "frontend" ? merge(svc.environment, {
        VITE_API_URL = "http://${module.alb.alb_dns_name}"
        API_UPSTREAM = module.alb.alb_dns_name
      }) : merge(svc.environment, local.service_db_envs[name])
      command = try(svc.command, null)
    }
  }
}

module "network" {
  source               = "../../modules/network"
  name_prefix          = var.name_prefix
  vpc_cidr             = var.vpc_cidr
  azs                  = var.azs
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  tags                 = var.tags
}

module "bastion" {
  count = local.enable_bastion ? 1 : 0

  source            = "../../modules/bastion"
  name_prefix       = var.name_prefix
  vpc_id            = module.network.vpc_id
  public_subnet_id  = module.network.public_subnet_ids_by_key["a"]
  allowed_ssh_cidrs = var.bastion_ingress_cidrs
  key_name          = var.bastion_key_name
  instance_type     = var.bastion_instance_type
  tags              = var.tags
}

module "security" {
  source                     = "../../modules/security"
  name_prefix                = var.name_prefix
  vpc_id                     = module.network.vpc_id
  app_ports                  = distinct([for _, svc in var.services : svc.container_port])
  reviews_bucket_arn         = local.reviews_bucket_arn
  reviews_dynamodb_table_arn = local.reviews_table_arn
  tags                       = var.tags
}

module "ecr" {
  source       = "../../modules/ecr"
  name_prefix  = var.name_prefix
  repositories = var.ecr_repositories
  force_delete = true
  tags         = var.tags
}

module "logging" {
  source      = "../../modules/logging"
  name_prefix = var.name_prefix
  services    = keys(var.services)
  tags        = var.tags
}

module "alb" {
  source            = "../../modules/alb"
  name_prefix       = var.name_prefix
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  alb_sg_id         = module.security.alb_sg_id
  services          = local.alb_services
  tags              = var.tags
}

module "storage" {
  source                    = "../../modules/storage"
  name_prefix               = var.name_prefix
  private_subnet_keys       = local.private_subnet_keys
  private_subnet_ids_by_key = module.network.private_subnet_ids_by_key
  ecs_sg_id                 = module.security.ecs_sg_id
  tags                      = var.tags
}

module "dynamodb" {
  source      = "../../modules/dynamodb"
  name_prefix = var.name_prefix
  tags        = var.tags
}

module "rds" {
  source             = "../../modules/rds"
  name_prefix        = var.name_prefix
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  ecs_sg_id          = module.security.ecs_sg_id
  bastion_sg_id      = try(module.bastion[0].security_group_id, null)
  db_username        = var.db_username
  db_password        = var.db_password
  tags               = var.tags
}

module "ecs" {
  source                      = "../../modules/ecs"
  name_prefix                 = var.name_prefix
  private_subnet_ids          = module.network.private_subnet_ids
  ecs_sg_id                   = module.security.ecs_sg_id
  target_group_arns           = module.alb.target_group_arns
  ecs_task_execution_role_arn = module.security.ecs_task_execution_role_arn
  ecs_task_role_arn           = module.security.ecs_task_role_arn
  log_group_names             = module.logging.log_group_names
  aws_region                  = var.aws_region
  services                    = local.ecs_services
  tags                        = var.tags
}

module "monitoring" {
  source        = "../../modules/monitoring"
  name_prefix   = var.name_prefix
  cluster_name  = module.ecs.cluster_name
  service_names = [for k in keys(var.services) : "${var.name_prefix}-${k}"]
  tags          = var.tags
}
