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
    priority = 10
    # 앱 실제 라우트: /api/health, /api/auth, /api/products, /api/cart ...
    # /uploads/*: 파일 업로드/다운로드 요청도 api-node로 라우팅
    # 다른 서비스 이미지 준비되면 경로 분리 예정
    path_patterns = ["/api/*", "/uploads/*"]
    health_check  = "/api/health"
  }

  # ──────────────────────────────────────────────────────
  # api-python: FastAPI 서버 (포트 8000)
  # DB: SQLite(dev), Storage: local, Cache: memory, Queue: sync
  # ──────────────────────────────────────────────────────
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

  # ──────────────────────────────────────────────────────
  # api-spring: Spring Boot 서버 (포트 8080)
  # Profile: local → H2 파일DB, 로컬 스토리지 (외부 의존성 없음)
  # ──────────────────────────────────────────────────────
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

  # ──────────────────────────────────────────────────────
  # frontend: React 앱 (포트 80, nginx 서빙)
  # VITE_API_URL은 main.tf에서 ALB DNS로 자동 주입됨
  # ──────────────────────────────────────────────────────
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
# db_password는 여기에 쓰지 않습니다 (git에 올라가면 위험)
# 로컬 실행 전:  export TF_VAR_db_password="원하는비밀번호"
# GitHub Actions: Secrets에 TF_VAR_DB_PASSWORD 등록
