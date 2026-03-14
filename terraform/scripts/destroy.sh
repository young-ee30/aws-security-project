#!/bin/bash
# =============================================================
# terraform/scripts/destroy.sh
# 목적: dev 환경 전체 AWS 리소스 삭제 (비용 차단)
# 실행: ./terraform/scripts/destroy.sh
#
# 삭제되는 것:
#   VPC / 서브넷 / NAT Gateway / ALB / ECS / ECR(이미지 포함)
#   S3(artifacts) / EFS / CloudWatch / IAM Role / SG
#
# 삭제 안 되는 것:
#   bootstrap S3 버킷 (state 파일용, prevent_destroy 보호)
#   → 보관해도 비용 거의 없음 ($0.002/월 수준)
#   → 완전히 지우려면 스크립트 마지막 안내 참고
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DEV_DIR="${PROJECT_ROOT}/terraform/envs/dev"
BACKEND_HCL="${DEV_DIR}/backend.hcl"

echo ""
echo "========================================="
echo "  ⚠️  Dev 환경 리소스 전체 삭제"
echo "========================================="
echo ""
echo "  아래 리소스가 모두 삭제됩니다:"
echo "  - NAT Gateway / EIP / ALB (시간당 과금 중단)"
echo "  - ECS 서비스 / 태스크"
echo "  - ECR 레포지토리 (이미지 포함)"
echo "  - VPC / 서브넷 / 보안그룹"
echo "  - S3 artifacts 버킷 / EFS"
echo "  - CloudWatch / IAM Role"
echo ""

# 확인 프롬프트
read -p "  정말 삭제하시겠습니까? (yes 입력): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "  취소됐습니다."
  exit 0
fi

# backend.hcl 존재 확인
if [ ! -f "${BACKEND_HCL}" ]; then
  echo ""
  echo "❌ backend.hcl 파일이 없습니다. setup.sh를 먼저 실행하세요."
  exit 1
fi

cd "${DEV_DIR}"

# ─────────────────────────────────────────────
# terraform init (state 연결)
# ─────────────────────────────────────────────
echo ""
echo "▶ [1/2] terraform init..."
terraform init \
  -input=false \
  -backend-config=backend.hcl \
  -reconfigure

# ─────────────────────────────────────────────
# terraform destroy
# ─────────────────────────────────────────────
echo ""
echo "▶ [2/2] terraform destroy... (5~10분 소요)"
echo ""
terraform destroy -input=false

echo ""
echo "========================================="
echo "  ✅ 삭제 완료!"
echo "========================================="
echo ""
echo "  과금 중단 확인:"
echo "  - NAT Gateway: AWS 콘솔 → VPC → NAT Gateways (없으면 OK)"
echo "  - ALB:         AWS 콘솔 → EC2 → Load Balancers (없으면 OK)"
echo ""
echo "  ─────────────────────────────────────────"
echo "  Bootstrap S3 버킷은 아직 남아있습니다."
echo "  다음에 다시 배포하면 그대로 재사용됩니다."
echo ""
echo "  완전히 삭제하려면:"
echo "  1) AWS 콘솔 → S3 → 버킷 선택 → 객체 전부 삭제 → 버킷 삭제"
echo "  2) rm ${BACKEND_HCL}"
echo "  ─────────────────────────────────────────"
echo ""
