#!/bin/bash
# =============================================================
# terraform/scripts/deploy.sh
# 목적: dev 환경 전체 인프라 배포
# 실행: ./terraform/scripts/deploy.sh
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DEV_DIR="${PROJECT_ROOT}/terraform/envs/dev"
BACKEND_HCL="${DEV_DIR}/backend.hcl"

echo ""
echo "========================================="
echo "  DevSecOps Dev 환경 배포"
echo "========================================="

# backend.hcl 존재 확인 (setup.sh를 먼저 실행했는지 체크)
if [ ! -f "${BACKEND_HCL}" ]; then
  echo ""
  echo "❌ backend.hcl 파일이 없습니다."
  echo "   먼저 setup.sh를 실행하세요:"
  echo "   ./terraform/scripts/setup.sh"
  exit 1
fi

cd "${DEV_DIR}"

# ─────────────────────────────────────────────
# terraform init (이미 했어도 안전하게 재실행)
# ─────────────────────────────────────────────
echo ""
echo "▶ [1/2] terraform init..."
terraform init \
  -input=false \
  -backend-config=backend.hcl \
  -reconfigure

# ─────────────────────────────────────────────
# terraform apply
# ─────────────────────────────────────────────
echo ""
echo "▶ [2/2] terraform apply..."
echo "   (약 3~5분 소요, NAT Gateway + ALB 생성에 시간이 걸려요)"
echo ""
terraform apply -input=false

# ─────────────────────────────────────────────
# 배포 완료 후 ALB URL 출력
# ─────────────────────────────────────────────
echo ""
echo "========================================="
echo "  ✅ 배포 완료!"
echo "========================================="
echo ""
echo "  ALB DNS (api-node 접근):"
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "출력 실패 - 콘솔에서 확인")
echo "  http://${ALB_DNS}/node/health"
echo ""
echo "  ⚠️  ECS 태스크가 완전히 뜨는데 1~2분 추가 소요됩니다."
echo "     헬스체크 통과 전까지 503이 나올 수 있어요."
echo ""
echo "  테스트 완료 후 정리:"
echo "  ./terraform/scripts/destroy.sh"
echo ""
