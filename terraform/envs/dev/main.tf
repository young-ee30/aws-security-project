locals {
  alb_services = {
    for name, svc in var.services : name => {
      priority      = svc.priority
      path_patterns = svc.path_patterns
      health_check  = svc.health_check
      port          = svc.container_port
    }
  }

  # =============================================================
  # 서비스별 DB 환경변수
  # RDS 엔드포인트는 apply 후 확정되므로 locals에서 module 참조
  # =============================================================

  # api-node: MySQL 접속 정보
  db_env_node = {
    DB_TYPE     = "mysql"
    DB_HOST     = module.rds.endpoint
    DB_PORT     = tostring(module.rds.port)
    DB_USER     = module.rds.username
    DB_PASSWORD = var.db_password
    DB_NAME     = "ecommerce_node"
  }

  # api-python: MySQL 접속 정보
  db_env_python = {
    DB_TYPE     = "mysql"
    DB_HOST     = module.rds.endpoint
    DB_PORT     = tostring(module.rds.port)
    DB_USER     = module.rds.username
    DB_PASSWORD = var.db_password
    DB_NAME     = "ecommerce_python"
  }

  # api-spring: local 프로파일 유지하되 datasource만 MySQL로 override
  # SPRING_DATASOURCE_* 환경변수가 application-local.yml의 H2 설정을 덮어씀
  # storage/cache/queue는 local/memory/sync 그대로 유지 (S3, Redis 불필요)
  db_env_spring = {
    SPRING_DATASOURCE_URL      = "jdbc:mysql://${module.rds.endpoint}:${module.rds.port}/ecommerce_spring?useSSL=false&allowPublicKeyRetrieval=true&createDatabaseIfNotExist=true"
    SPRING_DATASOURCE_USERNAME = module.rds.username
    SPRING_DATASOURCE_PASSWORD = var.db_password
  }

  # 서비스 이름 → DB 환경변수 매핑
  service_db_envs = {
    "api-node"   = local.db_env_node
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
      # frontend: ALB DNS 주입 (VITE_API_URL)
      # 백엔드: tfvars 환경변수 + RDS 접속 정보 merge
      environment = name == "frontend" ? merge(svc.environment, {
        VITE_API_URL = "http://${module.alb.alb_dns_name}"
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

module "security" {
  source      = "../../modules/security"
  name_prefix = var.name_prefix
  vpc_id      = module.network.vpc_id
  # 전체 서비스 포트 목록 (ALB → ECS 인바운드 허용)
  # frontend:80, api-node:5000, api-python:8000, api-spring:8080
  app_ports = [80, 5000, 8000, 8080]
  tags      = var.tags
}

module "ecr" {
  source       = "../../modules/ecr"
  name_prefix  = var.name_prefix
  repositories = var.ecr_repositories
  # dev: 이미지가 있어도 terraform destroy 가능하게 설정
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
  source             = "../../modules/storage"
  name_prefix        = var.name_prefix
  private_subnet_ids = module.network.private_subnet_ids
  ecs_sg_id          = module.security.ecs_sg_id
  tags               = var.tags
}

module "rds" {
  source             = "../../modules/rds"
  name_prefix        = var.name_prefix
  vpc_id             = module.network.vpc_id
  private_subnet_ids = module.network.private_subnet_ids
  ecs_sg_id          = module.security.ecs_sg_id
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
  service_names = module.ecs.service_names
  tags          = var.tags
}
