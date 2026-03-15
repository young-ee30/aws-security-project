# my-devsecops-platform

AWS ECS Fargate 기반 멀티 서비스 배포 플랫폼.
GitHub Actions + Terraform으로 인프라와 앱 배포를 자동화합니다.

---

## 프로젝트 구조

```
my-devsecops-platform/
│
├── .github/                        # GitHub Actions CI/CD 자동화
│   └── workflows/
│       ├── build-push-ecr.yml      # 서비스 코드 변경 시 자동 실행
│       │                           # Docker 빌드 → ECR push → ECS 롤링 배포
│       └── terraform.yml           # 인프라 코드 변경 시 자동 실행
│                                   # PR → plan 결과 코멘트 / main push → apply
│
├── services/                       # 배포 대상 애플리케이션
│   ├── ecommerce-app-node/         # Node.js 백엔드 (현재 배포 중, port 5000)
│   ├── ecommerce-app-fastapi/      # Python FastAPI 백엔드 (port 8000)
│   ├── ecommerce-app-spring/       # Spring Boot 백엔드 (port 8080)
│   └── frontend/                   # React 프론트엔드 (port 80)
│
├── terraform/                      # AWS 인프라 IaC (Terraform)
│   │
│   ├── bootstrap/                  # S3 state 버킷 생성 (최초 1회만 실행)
│   │                               # 이후 모든 terraform state는 이 버킷에 저장
│   │
│   ├── modules/                    # 재사용 가능한 AWS 리소스 모듈
│   │   ├── network/                # VPC, 서브넷, NAT Gateway, 라우팅
│   │   ├── security/               # 보안그룹, IAM Role
│   │   ├── ecr/                    # Docker 이미지 저장소
│   │   ├── ecs/                    # ECS 클러스터, 서비스, 태스크 정의
│   │   ├── alb/                    # 로드밸런서, Target Group, 리스너
│   │   ├── storage/                # EFS 파일시스템
│   │   ├── logging/                # CloudWatch 로그 그룹
│   │   └── monitoring/             # CloudWatch 알람
│   │
│   └── envs/                       # 환경별 설정값
│       ├── dev/                    # 개발 환경
│       │   ├── main.tf             # modules 조합 진입점
│       │   ├── backend.tf          # S3 state 저장 위치 (key: dev/terraform.tfstate)
│       │   ├── backend.hcl         # ⚠️ gitignore - 버킷 이름 (scripts/setup.sh가 생성)
│       │   ├── terraform.tfvars    # 실제 변수값 (이미지 URL, desired_count 등)
│       │   ├── variables.tf        # 변수 선언
│       │   └── outputs.tf          # ALB DNS 등 출력값
│       └── prod/                   # 운영 환경 (dev와 동일 구조, 값만 다름)
│
├── scripts/                        # 로컬 자원관리 (수동 실행용)
│   ├── setup.sh                    # 최초 셋업 (bootstrap → ECR 생성)
│   ├── ecr-push-test.sh            # 로컬에서 직접 이미지 빌드 & ECR push
│   ├── deploy.sh                   # 로컬에서 직접 terraform apply
│   └── destroy.sh                  # 인프라 전체 삭제 (비용 차단)
│
├── security/                       # 보안 점검 도구 및 결과
│   ├── checkov/                    # Terraform IaC 보안 스캔
│   ├── trivy/                      # 컨테이너 이미지 취약점 점검
│   ├── semgrep/                    # 소스코드 정적 분석
│   ├── gitleaks/                   # 시크릿 유출 탐지
│   └── reports/                    # 스캔 결과 저장
│
├── docs/                           # 아키텍처 및 프로젝트 문서
├── .env.example                    # 환경변수 예시
├── .gitignore
└── README.md
```

---

## 배포 흐름

### 인프라 변경 시 (자동)
```
terraform/ 코드 수정 → git push main
→ terraform.yml 자동 실행
→ terraform init (S3 state 연결)
→ terraform plan → apply
→ AWS 리소스 생성/변경
```

### 앱 변경 시 (자동)
```
services/ 코드 수정 → git push main
→ build-push-ecr.yml 자동 실행 (변경된 서비스만)
→ Docker 빌드 → ECR push (git SHA + latest)
→ ECS Task Definition 이미지 URI 교체
→ ECS 롤링 배포 → 안정화 대기
```

### 로컬 직접 실행 시 (수동)
```bash
./scripts/setup.sh              # 최초 1회: S3 버킷 생성 + ECR 생성
./scripts/ecr-push-test.sh      # 이미지 빌드 & push
./scripts/deploy.sh             # terraform apply
./scripts/destroy.sh            # 전체 삭제
```

---

## GitHub Secrets 설정

| Secret | 설명 |
|---|---|
| `AWS_ROLE_ARN` | ECR/ECS 배포용 OIDC IAM Role ARN |
| `AWS_ROLE_ARN_TERRAFORM` | Terraform 실행용 OIDC IAM Role ARN |
| `TF_STATE_BUCKET` | bootstrap으로 생성된 S3 버킷 이름 |

OIDC 설정 방법: `.github/SETUP_OIDC.md` 참고

---

## 현재 배포 상태

| 서비스 | 상태 | 포트 | 헬스체크 |
|---|---|---|---|
| api-node | ✅ 배포 중 | 5000 | `/api/health` |
| api-python | ⏸ 이미지 준비 중 | 8000 | `/health` |
| api-spring | ⏸ 이미지 준비 중 | 8080 | `/actuator/health` |
| frontend | ⏸ 이미지 준비 중 | 80 | `/` |
