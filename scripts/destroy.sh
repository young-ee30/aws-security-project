#!/bin/bash
# =============================================================
# scripts/destroy.sh
# 역할: dev 환경 전체 AWS 리소스 삭제 (비용 차단)
#
# 삭제되는 것:
#   VPC / 서브넷 / NAT Gateway / ALB / ECS / ECR(이미지 포함)
#   S3(artifacts) / EFS / CloudWatch / IAM Role / SG
#
# 삭제 안 되는 것:
#   terraform/bootstrap S3 버킷 (prevent_destroy 보호)
#
# 실행: ./scripts/destroy.sh
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEV_DIR="${PROJECT_ROOT}/terraform/envs/dev"
BACKEND_HCL="${DEV_DIR}/backend.hcl"

echo ""
echo "========================================="
echo "  ⚠️  Dev 환경 리소스 전체 삭제"
echo "========================================="
echo ""
echo "  삭제 대상:"
echo "  - NAT Gateway / EIP / ALB (시간당 과금 중단)"
echo "  - ECS 서비스 / 태스크"
echo "  - ECR 레포지토리 (이미지 포함)"
echo "  - VPC / 서브넷 / 보안그룹"
echo "  - S3 artifacts / EFS / CloudWatch / IAM"
echo ""

read -p "  정말 삭제하시겠습니까? (yes 입력): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "  취소됐습니다."
  exit 0
fi

if [ ! -f "${BACKEND_HCL}" ]; then
  echo "❌ backend.hcl 없음. ./scripts/setup.sh 먼저 실행하세요."
  exit 1
fi

cd "${DEV_DIR}"

echo ""
echo "▶ [1/2] terraform init..."
terraform init \
  -input=false \
  -backend-config=backend.hcl \
  -reconfigure

echo ""
echo "▶ [2/2] terraform destroy... (5~10분 소요)"
echo ""
terraform destroy -input=false

echo ""
echo "========================================="
echo "  ✅ 삭제 완료!"
echo "========================================="
echo ""
echo "  Bootstrap S3 버킷은 유지됩니다 (재배포 시 재사용)"
echo "  완전 삭제하려면: AWS 콘솔 → S3 → 버킷 직접 삭제"
echo ""
