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
  "frontend"
]

services = {

  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
  # api-node: ???��?지 ?�음 (ECR push ?�료)
  # image 값�? ecr-push-test.sh ?�행 ???�동 ?�데?�트??
  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
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
    priority = 10
    # ???�제 ?�우?? /api/health, /api/auth, /api/products, /api/cart ...
    # /uploads/*: ?�일 ?�로???�운로드 ?�청??api-node�??�우??
    # ?�른 ?�비???��?지 준비되�?경로 분리 ?�정
    path_patterns = ["/api/*", "/uploads/*"]
    health_check  = "/api/health"
  }

  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
  # api-python: FastAPI ?�버 (?�트 8000)
  # DB: SQLite(dev), Storage: local, Cache: memory, Queue: sync
  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
  api-python = {
    cpu            = 256
    memory         = 512
    container_port = 8000
    desired_count  = 0
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-python:latest"
    environment = {
      PORT         = "8000"
      DB_TYPE      = "sqlite"
      STORAGE_TYPE = "local"
      REVIEW_STORE = "local"
      CACHE_TYPE   = "memory"
      QUEUE_TYPE   = "sync"
      JWT_SECRET   = "ecommerce-jwt-secret-key-2024"
    }
    priority      = 20
    path_patterns = ["/python*", "/api/python*"]
    health_check  = "/api/health"
  }

  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
  # api-spring: Spring Boot ?�버 (?�트 8080)
  # Profile: local ??H2 ?�일DB, 로컬 ?�토리�? (?��? ?�존???�음)
  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
  api-spring = {
    cpu            = 512
    memory         = 1024
    container_port = 8080
    desired_count  = 0
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-spring:latest"
    environment = {
      SPRING_PROFILES_ACTIVE = "local"
      SERVER_PORT            = "8080"
    }
    priority      = 30
    path_patterns = ["/spring*", "/api/spring*"]
    health_check  = "/actuator/health"
  }

  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
  # frontend: React ??(?�트 80, nginx ?�빙)
  # VITE_API_URL?� main.tf?�서 ALB DNS�??�동 주입??
  # ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
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
# db_password???�기???��? ?�습?�다 (git???�라가�??�험)
# 로컬 ?�행 ??  export TF_VAR_db_password="?�하?�비밀번호"
# GitHub Actions: Secrets??TF_VAR_DB_PASSWORD ?�록

# Bastion: SSM Session Manager로 접속 (SSH 키 불필요)
# RDS 접속 시: aws ssm start-session --target <instance-id> --document-name AWS-StartPortForwardingSessionToRemoteHost
enable_bastion = true
# bastion_key_name = "your-existing-keypair"  # SSH 접속이 필요한 경우만 설정
# bastion_ingress_cidrs = ["203.0.113.10/32"]  # SSH 접속이 필요한 경우만 설정
