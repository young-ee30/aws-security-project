aws_region = "ap-northeast-2"
name_prefix = "devsecops-dev"
vpc_cidr = "10.10.0.0/16"
azs = ["ap-northeast-2a", "ap-northeast-2c"]
public_subnet_cidrs = ["10.10.1.0/24", "10.10.2.0/24"]
private_subnet_cidrs = ["10.10.11.0/24", "10.10.12.0/24"]

ecr_repositories = [
  "api-node",
  "api-python",
  "api-spring",
  "frontend"
]

services = {
  frontend = {
    cpu            = 256
    memory         = 512
    container_port = 80
    desired_count  = 1
    image          = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/frontend:latest"
    environment    = {}
    priority       = 100
    path_patterns  = ["/*"]
    health_check   = "/"
  }
  api-node = {
    cpu            = 256
    memory         = 512
    container_port = 3000
    desired_count  = 1
    image          = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-node:latest"
    environment    = {
      NODE_ENV = "development"
      PORT     = "3000"
    }
    priority       = 10
    path_patterns  = ["/node*", "/api/node*"]
    health_check   = "/health"
  }
  api-python = {
    cpu            = 256
    memory         = 512
    container_port = 8000
    desired_count  = 1
    image          = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-python:latest"
    environment    = {
      APP_ENV = "development"
      PORT    = "8000"
    }
    priority       = 20
    path_patterns  = ["/python*", "/api/python*"]
    health_check   = "/health"
  }
  api-spring = {
    cpu            = 512
    memory         = 1024
    container_port = 8080
    desired_count  = 1
    image          = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-spring:latest"
    environment    = {
      SPRING_PROFILES_ACTIVE = "dev"
      SERVER_PORT            = "8080"
    }
    priority       = 30
    path_patterns  = ["/spring*", "/api/spring*"]
    health_check   = "/actuator/health"
  }
}

tags = {
  Project     = "my-devsecops-platform"
  Environment = "dev"
  ManagedBy   = "terraform"
}
