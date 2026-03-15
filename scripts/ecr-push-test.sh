#!/bin/bash
# =============================================================
# scripts/ecr-push-test.sh
# 역할: 로컬에서 직접 Docker 이미지 빌드 & ECR push
#       (GitHub Actions 없이 수동으로 배포할 때 사용)
#
# 사용법:
#   ./scripts/ecr-push-test.sh              # 기본값: api-node
#   ./scripts/ecr-push-test.sh api-python
#   ./scripts/ecr-push-test.sh api-spring
#   ./scripts/ecr-push-test.sh frontend
#
# 사전 조건:
#   1) aws configure 완료
#   2) Docker Desktop 실행 중
#   3) setup.sh 로 ECR 레포 생성 완료
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

SERVICE_NAME="${1:-api-node}"

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

if [ ! -f "${DOCKERFILE_PATH}/Dockerfile" ]; then
  echo "❌ Dockerfile 없음: ${DOCKERFILE_PATH}/Dockerfile"
  exit 1
fi

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
echo "  ECR Repo  : ${ECR_REPO}"
echo "  Image Tag : ${IMAGE_TAG}"
echo "======================================"
echo ""

# ECR 로그인
echo "▶ [1/5] ECR 로그인..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# 빌드
echo ""
echo "▶ [2/5] Docker 이미지 빌드..."
docker build --platform linux/amd64 -t "${SERVICE_NAME}:${IMAGE_TAG}" "${DOCKERFILE_PATH}"

# 태깅
echo ""
echo "▶ [3/5] ECR 태그 지정..."
docker tag "${SERVICE_NAME}:${IMAGE_TAG}" "${ECR_REPO}:${IMAGE_TAG}"
docker tag "${SERVICE_NAME}:${IMAGE_TAG}" "${ECR_REPO}:latest"

# Push
echo ""
echo "▶ [4/5] ECR Push..."
docker push "${ECR_REPO}:${IMAGE_TAG}"
docker push "${ECR_REPO}:latest"

# terraform.tfvars 자동 업데이트
echo ""
echo "▶ [5/5] terraform.tfvars 자동 업데이트..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|.*dkr\.ecr\..*/${NAME_PREFIX}/${SERVICE_NAME}:.*|    image          = \"${ECR_REPO}:${IMAGE_TAG}\"|g" "${TFVARS_PATH}"
else
  sed -i "s|.*dkr\.ecr\..*/${NAME_PREFIX}/${SERVICE_NAME}:.*|    image          = \"${ECR_REPO}:${IMAGE_TAG}\"|g" "${TFVARS_PATH}"
fi

echo "✅ 완료: ${ECR_REPO}:${IMAGE_TAG}"
echo ""
echo "  다음 단계:"
echo "  ./scripts/deploy.sh    ← 인프라에 반영"
echo ""
