#!/bin/bash
# =============================================================
# scripts/deploy.sh
# 역할: 로컬에서 직접 dev 환경 전체 인프라 배포
#       (GitHub Actions 없이 수동으로 배포할 때 사용)
#
# 실행: ./scripts/deploy.sh
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEV_DIR="${PROJECT_ROOT}/terraform/envs/dev"
BACKEND_HCL="${DEV_DIR}/backend.hcl"

echo ""
echo "========================================="
echo "  DevSecOps Dev 환경 배포"
echo "========================================="

if [ ! -f "${BACKEND_HCL}" ]; then
  echo ""
  echo "❌ backend.hcl 파일이 없습니다."
  echo "   먼저 setup.sh를 실행하세요:"
  echo "   ./scripts/setup.sh"
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
echo "▶ [2/2] terraform apply... (약 5~8분 소요)"
echo ""
terraform apply -input=false

echo ""
echo "========================================="
echo "  ✅ 배포 완료!"
echo "========================================="
echo ""
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "출력 실패 - 콘솔에서 확인")
echo "  ALB DNS: http://${ALB_DNS}"
echo "  헬스체크: http://${ALB_DNS}/api/health"
echo ""
echo "  테스트 완료 후 정리:"
echo "  ./scripts/destroy.sh"
echo ""
