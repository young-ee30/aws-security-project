#!/bin/bash
# =============================================================
# terraform/scripts/ecr-push-test.sh
# 목적: 서비스 이미지를 빌드 → ECR push → terraform.tfvars 자동 업데이트
#
# 사용법:
#   ./terraform/scripts/ecr-push-test.sh              # 기본값: api-node
#   ./terraform/scripts/ecr-push-test.sh api-python   # 서비스 이름 지정
#   ./terraform/scripts/ecr-push-test.sh api-spring
#   ./terraform/scripts/ecr-push-test.sh frontend
#
# 사전 조건:
#   1) aws configure 완료
#   2) Docker Desktop 실행 중
#   3) setup.sh 로 ECR 레포 생성 완료
# =============================================================

set -e

# ─────────────────────────────────────────────
# 서비스 이름 → Dockerfile 경로 매핑
# ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

SERVICE_NAME="${1:-api-node}"  # 인자 없으면 api-node 기본값

case "$SERVICE_NAME" in
  api-node)
    DOCKERFILE_PATH="${PROJECT_ROOT}/services/ecommerce-app-node/api-server"
    ;;
  api-python)
    DOCKERFILE_PATH="${PROJECT_ROOT}/services/ecommerce-app-fastapi/api-server-fastapi"
    ;;
  api-spring)
    DOCKERFILE_PATH="${PROJECT_ROOT}/services/ecommerce-app-spring/api-server-spring"
    ;;
  frontend)
    DOCKERFILE_PATH="${PROJECT_ROOT}/services/frontend/ecommerce-app-frontend/frontend"
    ;;
  *)
    echo "❌ 알 수 없는 서비스: ${SERVICE_NAME}"
    echo "   사용 가능: api-node | api-python | api-spring | frontend"
    exit 1
    ;;
esac

# Dockerfile 존재 확인
if [ ! -f "${DOCKERFILE_PATH}/Dockerfile" ]; then
  echo "❌ Dockerfile 없음: ${DOCKERFILE_PATH}/Dockerfile"
  echo "   해당 서비스의 Dockerfile을 먼저 만들어주세요"
  exit 1
fi

# ─────────────────────────────────────────────
# AWS 설정
# ─────────────────────────────────────────────
AWS_REGION="ap-northeast-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
NAME_PREFIX="devsecops-dev"
IMAGE_TAG="dev-$(date +%Y%m%d-%H%M%S)"

ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${NAME_PREFIX}/${SERVICE_NAME}"
TFVARS_PATH="${PROJECT_ROOT}/terraform/envs/dev/terraform.tfvars"

echo ""
echo "======================================"
echo "  ECR Push: ${SERVICE_NAME}"
echo "======================================"
echo "  AWS Account : ${AWS_ACCOUNT_ID}"
echo "  ECR Repo    : ${ECR_REPO}"
echo "  Image Tag   : ${IMAGE_TAG}"
echo "  Dockerfile  : ${DOCKERFILE_PATH}"
echo "======================================"
echo ""

# ─────────────────────────────────────────────
# STEP 1: ECR 로그인
# ─────────────────────────────────────────────
echo "▶ [1/5] ECR 로그인..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
echo "✅ ECR 로그인 완료"

# ─────────────────────────────────────────────
# STEP 2: Docker 이미지 빌드
# ─────────────────────────────────────────────
echo ""
echo "▶ [2/5] Docker 이미지 빌드..."
docker build \
  --platform linux/amd64 \
  -t "${SERVICE_NAME}:${IMAGE_TAG}" \
  "${DOCKERFILE_PATH}"
echo "✅ 빌드 완료"

# ─────────────────────────────────────────────
# STEP 3: ECR 태그
# ─────────────────────────────────────────────
echo ""
echo "▶ [3/5] ECR 태그 지정..."
docker tag "${SERVICE_NAME}:${IMAGE_TAG}" "${ECR_REPO}:${IMAGE_TAG}"
docker tag "${SERVICE_NAME}:${IMAGE_TAG}" "${ECR_REPO}:latest"
echo "✅ 태그 완료"

# ─────────────────────────────────────────────
# STEP 4: ECR Push
# ─────────────────────────────────────────────
echo ""
echo "▶ [4/5] ECR Push..."
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:latest"
echo "✅ Push 완료"

# ─────────────────────────────────────────────
# STEP 5: terraform.tfvars 자동 업데이트
# ─────────────────────────────────────────────
echo ""
echo "▶ [5/5] terraform.tfvars 자동 업데이트..."

# macOS와 Linux/Windows(Git Bash) sed 방식 분기
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|.*dkr\.ecr\..*/${NAME_PREFIX}/${SERVICE_NAME}:.*|    image          = \"${ECR_REPO}:${IMAGE_TAG}\"|g" "${TFVARS_PATH}"
else
  sed -i "s|.*dkr\.ecr\..*/${NAME_PREFIX}/${SERVICE_NAME}:.*|    image          = \"${ECR_REPO}:${IMAGE_TAG}\"|g" "${TFVARS_PATH}"
fi

echo "✅ terraform.tfvars 업데이트 완료"
echo "   image = \"${ECR_REPO}:${IMAGE_TAG}\""

echo ""
echo "======================================"
echo "  ✅ 완료!"
echo "======================================"
echo ""
echo "  이미지가 없던 서비스를 배포하려면:"
echo "  1) terraform.tfvars 에서 해당 서비스 desired_count = 1 로 변경"
echo "  2) cd terraform/envs/dev && terraform apply"
echo ""
