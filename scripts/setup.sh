#!/bin/bash
# =============================================================
# scripts/setup.sh
# 역할: 로컬 최초 셋업 (최초 1회만 실행)
#
# 실행 순서:
#   1) terraform/bootstrap → S3 state 버킷 생성
#   2) 버킷 이름 읽어서 backend.hcl 자동 생성
#   3) dev 환경 terraform init (S3 backend 연결)
#   4) ECR 레포지토리 먼저 생성
#
# 실행:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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

BUCKET_NAME=$(terraform output -raw s3_bucket_name)

echo ""
echo "✅ S3 버킷 생성 완료: ${BUCKET_NAME}"
echo ""

# ─────────────────────────────────────────────
# STEP 2: backend.hcl 자동 생성
# ─────────────────────────────────────────────
echo "▶ [2/4] backend.hcl 자동 생성..."

cat > "${PROJECT_ROOT}/terraform/envs/dev/backend.hcl" <<EOF
# 자동 생성된 파일 - setup.sh가 생성함 (커밋하지 마세요)
bucket = "${BUCKET_NAME}"
EOF

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
# STEP 4: ECR 레포지토리 먼저 생성
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
echo "  ./scripts/ecr-push-test.sh api-node"
echo ""
echo "  ECR 레포 확인:"
cd "${PROJECT_ROOT}/terraform/envs/dev"
terraform output ecr_repository_urls
echo ""
