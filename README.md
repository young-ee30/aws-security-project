# my-devsecops-platform

```text
my-devsecops-platform/
│
├── .github/                    # GitHub Actions CI/CD 워크플로우
│   └── workflows/
│       ├── security-scan.yml   # 배포 전 보안 스캔
│       ├── build-and-push.yml  # Docker 이미지 빌드 및 ECR 푸시
│       ├── terraform-plan.yml  # Terraform 검증 및 실행 계획 확인
│       └── deploy.yml          # 인프라 및 서비스 배포
│
├── services/                   # 실제 배포 대상 애플리케이션
│   ├── api-node/               # Node.js 백엔드 서비스
│   ├── api-python/             # Python 백엔드 서비스
│   ├── api-spring/             # Spring Boot 백엔드 서비스
│   └── frontend/               # 프론트엔드 서비스
│
├── terraform/                  # AWS 인프라 전체 IaC 코드
│   ├── modules/                # 인프라 기능별 Terraform 모듈
│   │   ├── network/            # VPC, Subnet, Routing 등 네트워크
│   │   ├── security/           # SG, IAM, KMS 등 보안 리소스
│   │   ├── ecr/                # 컨테이너 이미지 저장소
│   │   ├── ecs/                # 컨테이너 실행 환경
│   │   ├── alb/                # 로드밸런서 구성
│   │   ├── monitoring/         # 모니터링 스택용 인프라
│   │   ├── logging/            # 로그 수집 관련 리소스
│   │   └── storage/            # S3, EBS, EFS 등 저장소
│   │
│   ├── envs/                   # 환경별 설정 분리
│   │   ├── dev/                # 개발 환경 설정
│   │   └── prod/               # 운영 환경 설정
│
├── security/                   # 배포 전 보안 점검 도구 및 결과
│   ├── checkov/                # Terraform/IaC 보안 스캔
│   ├── trivy/                  # 이미지 및 파일시스템 취약점 점검
│   ├── semgrep/                # 소스코드 정적 분석
│   ├── gitleaks/               # 시크릿 유출 탐지
│   └── reports/                # 스캔 결과 저장
│
├── docs/                       # 아키텍처 및 프로젝트 문서
│
├── .env.example                # 환경변수 예시
├── .gitignore                  # Git 추적 제외 파일 목록
└── README.md                   # 프로젝트 소개 및 실행 가이드
```
