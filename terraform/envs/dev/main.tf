locals {
  alb_services = {
    for name, svc in var.services : name => {
      priority      = svc.priority
      path_patterns = svc.path_patterns
      health_check  = svc.health_check
      port          = svc.container_port
    }
  }

  ecs_services = {
    for name, svc in var.services : name => {
      cpu            = svc.cpu
      memory         = svc.memory
      container_port = svc.container_port
      desired_count  = svc.desired_count
      image          = svc.image
      environment    = svc.environment
      command        = try(svc.command, null)
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

module "security" {
  source      = "../../modules/security"
  name_prefix = var.name_prefix
  vpc_id      = module.network.vpc_id
  app_port    = 3000
  tags        = var.tags
}

module "ecr" {
  source       = "../../modules/ecr"
  name_prefix  = var.name_prefix
  repositories = var.ecr_repositories
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
  source             = "../../modules/storage"
  name_prefix        = var.name_prefix
  private_subnet_ids = module.network.private_subnet_ids
  ecs_sg_id          = module.security.ecs_sg_id
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
  source       = "../../modules/monitoring"
  name_prefix  = var.name_prefix
  cluster_name = module.ecs.cluster_name
  service_names = module.ecs.service_names
  tags         = var.tags
}
