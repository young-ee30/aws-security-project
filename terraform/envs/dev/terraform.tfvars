aws_region  = "ap-northeast-2"
name_prefix = "devsecops-dev"
vpc_cidr    = "10.10.0.0/16"

azs                  = ["ap-northeast-2a", "ap-northeast-2c"]
public_subnet_cidrs  = ["10.10.1.0/24", "10.10.2.0/24"]
private_subnet_cidrs = ["10.10.11.0/24", "10.10.12.0/24"]

ecr_repositories = [
  "api-node",
  "api-python",
  "api-spring",
  "controlplane-api",
  "frontend"
]

active_backend = "api-python"

services = {
  api-node = {
    cpu            = 256
    memory         = 512
    container_port = 5000
    desired_count  = 1
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-node:dev-20260314-220146"
    environment = {
      NODE_ENV = "development"
      PORT     = "5000"
    }
    priority      = 10
    path_patterns = ["/api/node*", "/node*"]
    health_check  = "/api/health"
  }

  api-python = {
    cpu            = 256
    memory         = 512
    container_port = 8000
    desired_count  = 0
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-python:latest"
    environment = {
      PORT            = "8000"
      DB_TYPE         = "sqlite"
      STORAGE_TYPE    = "s3"
      S3_BUCKET       = "devsecops-dev-reviews"
      S3_REGION       = "ap-northeast-2"
      REVIEW_STORE    = "dynamodb"
      DYNAMODB_TABLE  = "devsecops-dev-reviews"
      DYNAMODB_REGION = "ap-northeast-2"
      CACHE_TYPE      = "memory"
      QUEUE_TYPE      = "sync"
      JWT_SECRET      = "ecommerce-jwt-secret-key-2024"
    }
    priority      = 20
    path_patterns = ["/python*", "/api/python*"]
    health_check  = "/api/health"
  }

  api-spring = {
    cpu            = 512
    memory         = 1024
    container_port = 8080
    desired_count  = 1
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-spring:latest"
    environment = {
      SPRING_PROFILES_ACTIVE = "prod"
      SERVER_PORT            = "8080"
    }
    priority      = 30
    path_patterns = ["/spring*", "/api/spring*"]
    health_check  = "/api/health"
  }

  controlplane-api = {
    cpu            = 256
    memory         = 512
    container_port = 4000
    desired_count  = 1
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/controlplane-api:latest"
    environment = {
      PORT                 = "4000"
      NODE_ENV             = "production"
      API_BASE_PATH        = "/controlplane"
      FRONTEND_ORIGIN      = "*"
      GITHUB_OWNER         = "aws-security-project"
      GITHUB_REPO          = "aws-security-project"
      GITHUB_APP_ID        = "1234567"
      GITHUB_APP_CLIENT_ID = ""
      LLM_MODEL            = "gemini-2.5-flash-lite"
    }
    secrets = {
      GITHUB_APP_PRIVATE_KEY = "arn:aws:secretsmanager:ap-northeast-2:282146511585:secret:devsecops-dev/controlplane/github-app-private-key"
      GEMINI_API_KEY         = "arn:aws:secretsmanager:ap-northeast-2:282146511585:secret:devsecops-dev/controlplane/gemini-api-key"
    }
    priority      = 40
    path_patterns = ["/controlplane/*"]
    health_check  = "/health"
  }

  frontend = {
    cpu            = 256
    memory         = 512
    container_port = 80
    desired_count  = 1
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/frontend:latest"
    environment    = {}
    priority       = 100
    path_patterns  = ["/*"]
    health_check   = "/"
  }
}

tags = {
  Project     = "my-devsecops-platform"
  Environment = "dev"
  ManagedBy   = "terraform"
}

db_username = "admin"
# db_password is intentionally not stored in git.
# For local runs, export TF_VAR_db_password before terraform apply.
# In GitHub Actions, set the TF_VAR_DB_PASSWORD secret.

# Bastion can be enabled without SSH by using SSM Session Manager.
enable_bastion = true
# bastion_key_name = "your-existing-keypair"
# bastion_ingress_cidrs = ["203.0.113.10/32"]
# bastion_instance_type = "t3.micro"
