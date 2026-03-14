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

  # ──────────────────────────────────────────────────────
  # api-node: ✅ 이미지 있음 (ECR push 완료)
  # image 값은 ecr-push-test.sh 실행 시 자동 업데이트됨
  # ──────────────────────────────────────────────────────
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
    # 앱 실제 라우트: /api/health, /api/auth, /api/products, /api/cart ...
    # 다른 서비스 이미지 준비되면 경로 분리 예정
    path_patterns = ["/api/*"]
    health_check  = "/api/health"
  }

  # ──────────────────────────────────────────────────────
  # api-python: ⏸ 이미지 없음 → desired_count = 0
  # Dockerfile 만들고 ./scripts/ecr-push-test.sh api-python 실행 후
  # desired_count = 1 로 변경하면 자동 배포됨
  # ──────────────────────────────────────────────────────
  api-python = {
    cpu            = 256
    memory         = 512
    container_port = 8000
    desired_count  = 0
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-python:latest"
    environment = {
      APP_ENV = "development"
      PORT    = "8000"
    }
    priority      = 20
    path_patterns = ["/python*", "/api/python*"]
    health_check  = "/health"
  }

  # ──────────────────────────────────────────────────────
  # api-spring: ⏸ 이미지 없음 → desired_count = 0
  # Dockerfile 만들고 ./scripts/ecr-push-test.sh api-spring 실행 후
  # desired_count = 1 로 변경하면 자동 배포됨
  # ──────────────────────────────────────────────────────
  api-spring = {
    cpu            = 512
    memory         = 1024
    container_port = 8080
    desired_count  = 0
    image          = "282146511585.dkr.ecr.ap-northeast-2.amazonaws.com/devsecops-dev/api-spring:latest"
    environment = {
      SPRING_PROFILES_ACTIVE = "dev"
      SERVER_PORT            = "8080"
    }
    priority      = 30
    path_patterns = ["/spring*", "/api/spring*"]
    health_check  = "/actuator/health"
  }

  # ──────────────────────────────────────────────────────
  # frontend: ⏸ 이미지 없음 → desired_count = 0
  # Dockerfile 만들고 ./scripts/ecr-push-test.sh frontend 실행 후
  # desired_count = 1 로 변경하면 자동 배포됨
  # ──────────────────────────────────────────────────────
  frontend = {
    cpu            = 256
    memory         = 512
    container_port = 80
    desired_count  = 0
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
