#!/bin/bash
# =============================================================
# terraform/scripts/setup.sh
# 목적: bootstrap → backend.hcl 자동 생성 → terraform init
#
# 이 스크립트 하나로 아래를 자동 처리합니다:
#   1) terraform/bootstrap/에서 S3 버킷 생성
#   2) 버킷 이름을 읽어서 backend.hcl 자동 생성
#   3) dev 환경 terraform init (backend.hcl 주입)
#   4) ECR 레포지토리만 먼저 생성 (apply -target)
#
# 실행:
#   chmod +x terraform/scripts/setup.sh
#   ./terraform/scripts/setup.sh
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo ""
echo "========================================="
echo "  DevSecOps Platform - 초기 셋업"
echo "========================================="
echo ""

# ─────────────────────────────────────────────
# STEP 1: bootstrap - S3 버킷 생성
# ─────────────────────────────────────────────
echo "▶ [1/4] bootstrap: S3 state 버킷 생성..."
cd "${PROJECT_ROOT}/terraform/bootstrap"

terraform init -input=false
terraform apply -input=false -auto-approve

# 버킷 이름 읽기
BUCKET_NAME=$(terraform output -raw s3_bucket_name)

echo ""
echo "✅ S3 버킷 생성 완료: ${BUCKET_NAME}"
echo ""

# ─────────────────────────────────────────────
# STEP 2: backend.hcl 자동 생성 (dev + prod)
# ─────────────────────────────────────────────
echo "▶ [2/4] backend.hcl 자동 생성..."

# dev 환경
cat > "${PROJECT_ROOT}/terraform/envs/dev/backend.hcl" <<EOF
# 자동 생성된 파일 - setup.sh가 생성함 (커밋하지 마세요)
bucket = "${BUCKET_NAME}"
EOF

# prod 환경
cat > "${PROJECT_ROOT}/terraform/envs/prod/backend.hcl" <<EOF
# 자동 생성된 파일 - setup.sh가 생성함 (커밋하지 마세요)
bucket = "${BUCKET_NAME}"
EOF

echo "✅ backend.hcl 생성 완료"
echo "   dev:  terraform/envs/dev/backend.hcl"
echo "   prod: terraform/envs/prod/backend.hcl"
echo ""

# ─────────────────────────────────────────────
# STEP 3: dev 환경 terraform init
# ─────────────────────────────────────────────
echo "▶ [3/4] dev 환경 terraform init..."
cd "${PROJECT_ROOT}/terraform/envs/dev"

terraform init \
  -input=false \
  -backend-config=backend.hcl \
  -reconfigure

echo "✅ terraform init 완료 (S3 backend 연결됨)"
echo ""

# ─────────────────────────────────────────────
# STEP 4: ECR 레포지토리만 먼저 생성
# ─────────────────────────────────────────────
echo "▶ [4/4] ECR 레포지토리 생성 (module.ecr만 apply)..."
terraform apply \
  -input=false \
  -auto-approve \
  -target=module.ecr

echo ""
echo "========================================="
echo "  ✅ 셋업 완료!"
echo "========================================="
echo ""
echo "  다음 단계: Docker 이미지 빌드 & ECR push"
echo "  cd ${PROJECT_ROOT}"
echo "  ./terraform/scripts/ecr-push-test.sh"
echo ""
echo "  ECR 레포 확인:"
cd "${PROJECT_ROOT}/terraform/envs/dev"
terraform output ecr_repository_urls
echo ""
