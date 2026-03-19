data "aws_caller_identity" "current" {}

locals {
  reviews_bucket_name = lower(replace("${var.name_prefix}-reviews", "_", "-"))
  reviews_bucket_arn  = "arn:aws:s3:::${local.reviews_bucket_name}"
  reviews_table_name  = "${var.name_prefix}-reviews"
  reviews_table_arn   = "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/${local.reviews_table_name}"
  enable_bastion      = var.enable_bastion
  private_subnet_keys = toset([
    for idx, _ in var.private_subnet_cidrs : substr(var.azs[idx], length(var.azs[idx]) - 1, 1)
  ])

  active_backend_public_path_patterns = ["/api/*", "/uploads/*"]

  service_specific_path_patterns = {
    "api-node"   = ["/api/node*", "/node*"]
    "api-python" = try(var.services["api-python"].path_patterns, ["/api/python*", "/python*"])
    "api-spring" = try(var.services["api-spring"].path_patterns, ["/api/spring*", "/spring*"])
  }

  effective_service_path_patterns = {
    for name, svc in var.services : name => (
      name == "frontend"
      ? svc.path_patterns
      : name == var.active_backend
      ? distinct(concat(local.active_backend_public_path_patterns, local.service_specific_path_patterns[name]))
      : local.service_specific_path_patterns[name]
    )
  }

  alb_services = {
    for name, svc in var.services : name => {
      priority      = svc.priority
      path_patterns = local.effective_service_path_patterns[name]
      health_check  = svc.health_check
      port          = svc.container_port
    }
  }

  backend_env_node = {
    DB_TYPE         = "mysql"
    DB_HOST         = module.rds.endpoint
    DB_PORT         = tostring(module.rds.port)
    DB_USER         = module.rds.username
    DB_PASSWORD     = var.db_password
    DB_NAME         = "ecommerce_node"
    STORAGE_TYPE    = "s3"
    S3_BUCKET       = local.reviews_bucket_name
    S3_REGION       = var.aws_region
    REVIEW_STORE    = "dynamodb"
    DYNAMODB_TABLE  = local.reviews_table_name
    DYNAMODB_REGION = var.aws_region
    CACHE_TYPE      = "memory"
    QUEUE_TYPE      = "sync"
    JWT_SECRET      = "ecommerce-jwt-secret-key-2024"
  }

  backend_env_python = {
    DB_TYPE         = "mysql"
    DB_HOST         = module.rds.endpoint
    DB_PORT         = tostring(module.rds.port)
    DB_USER         = module.rds.username
    DB_PASSWORD     = var.db_password
    DB_NAME         = "ecommerce_python"
    STORAGE_TYPE    = "s3"
    S3_BUCKET       = local.reviews_bucket_name
    S3_REGION       = var.aws_region
    REVIEW_STORE    = "dynamodb"
    DYNAMODB_TABLE  = local.reviews_table_name
    DYNAMODB_REGION = var.aws_region
    CACHE_TYPE      = "memory"
    QUEUE_TYPE      = "sync"
    JWT_SECRET      = "ecommerce-jwt-secret-key-2024"
  }

  backend_env_spring = {
    SPRING_PROFILES_ACTIVE     = "prod"
    SPRING_DATASOURCE_URL      = "jdbc:mysql://${module.rds.endpoint}:${module.rds.port}/ecommerce_spring?useSSL=false&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true"
    SPRING_DATASOURCE_USERNAME = module.rds.username
    SPRING_DATASOURCE_PASSWORD = var.db_password
    APP_DB_TYPE                = "mysql"
    APP_STORAGE_TYPE           = "s3"
    APP_STORAGE_S3_BUCKET      = local.reviews_bucket_name
    APP_STORAGE_S3_REGION      = var.aws_region
    APP_REVIEW_STORE           = "dynamodb"
    APP_REVIEW_DYNAMODB_TABLE  = local.reviews_table_name
    APP_REVIEW_DYNAMODB_REGION = var.aws_region
    APP_CACHE_TYPE             = "memory"
    APP_QUEUE_TYPE             = "sync"
    APP_AWS_REGION             = var.aws_region
    APP_JWT_SECRET             = "ecommerce-jwt-secret-key-2024"
  }

  service_backend_envs = {
    "api-node"   = local.backend_env_node
    "api-python" = local.backend_env_python
    "api-spring" = local.backend_env_spring
    "frontend"   = {}
  }

  service_desired_counts = {
    for name, svc in var.services : name => (
      name == "frontend"
      ? max(svc.desired_count, 1)
      : name == var.active_backend
      ? max(svc.desired_count, 1)
      : 0
    )
  }

  ecs_services = {
    for name, svc in var.services : name => {
      cpu            = svc.cpu
      memory         = svc.memory
      container_port = svc.container_port
      desired_count  = local.service_desired_counts[name]
      image          = svc.image
      environment = name == "frontend" ? merge(svc.environment, {
        VITE_API_URL = "http://${module.alb.alb_dns_name}"
        API_UPSTREAM = module.alb.alb_dns_name
      }) : merge(svc.environment, local.service_backend_envs[name])
      command = try(svc.command, null)
    }
  }
}

module "network" {
  source                = "../../modules/network"
  name_prefix           = var.name_prefix
  vpc_cidr              = var.vpc_cidr
  azs                   = var.azs
  public_subnet_cidrs   = var.public_subnet_cidrs
  private_subnet_cidrs  = var.private_subnet_cidrs
  tags                  = var.tags
  bastion_ingress_cidrs = var.bastion_ingress_cidrs
  app_ports             = distinct([for _, svc in var.services : svc.container_port])
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

module "cloudfront" {
  source = "../../modules/cloudfront"

  name_prefix  = var.name_prefix
  alb_dns_name = module.alb.alb_dns_name
  tags         = var.tags

  providers = {
    aws.us_east_1 = aws.us_east_1
  }
}

module "cloudtrail" {
  source      = "../../modules/cloudtrail"
  name_prefix = var.name_prefix
  tags        = var.tags
}

module "monitoring" {
  source        = "../../modules/monitoring"
  name_prefix   = var.name_prefix
  cluster_name  = module.ecs.cluster_name
  service_names = [for k in keys(var.services) : "${var.name_prefix}-${k}"]
  tags          = var.tags
}

module "guardduty" {
  source      = "../../modules/guardduty"
  name_prefix = var.name_prefix
  enabled     = true
  tags        = var.tags
}

module "prometheus" {
  source = "../../modules/prometheus"

  name_prefix          = var.name_prefix
  aws_region           = var.aws_region
  cluster_name         = module.ecs.cluster_name
  private_subnet_ids   = module.network.private_subnet_ids
  ecs_sg_id            = module.security.ecs_sg_id
  artifact_bucket_name = module.storage.artifact_bucket_name
  tags                 = var.tags
}
