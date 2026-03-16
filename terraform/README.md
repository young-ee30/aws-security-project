# Terraform 인프라 구성

이 폴더는 AWS 인프라 전체를 코드로 관리합니다.

---

## 전체 구조: 2개 영역의 역할

이 프로젝트는 역할에 따라 2개 영역으로 분리되어 있습니다.

```
📁 terraform/          → 인프라 정의 (ECS, ECR, VPC, ALB, RDS 등 AWS 리소스)
📁 .github/workflows/  → 자동화 실행 (코드가 push되면 빌드/배포)
```

Terraform이 "그릇"을 만들고, GitHub Actions가 거기에 "이미지(앱)"를 채웁니다.

```
Terraform이 먼저 실행되어:
  - ECS 클러스터, 서비스 생성 (컨테이너가 실행될 자리 마련)
  - ECR 레포지토리 생성 (이미지를 저장할 창고 마련)
  - RDS MySQL 생성 (서비스별 DB 분리)
  - ALB, 네트워크, 보안그룹 등 인프라 전체 구성

그 이후 GitHub Actions가:
  - 코드 push가 감지되면 Docker 이미지 빌드
  - ECR에 이미지 push
  - ECS 서비스에 새 이미지 배포
```

---

## 폴더 구조

```
terraform/
├── bootstrap/       ← S3 state 버킷 생성 (최초 1회만 실행)
├── modules/         ← 재사용 가능한 AWS 리소스 모음
│   ├── network/     - VPC, 서브넷, 라우팅
│   ├── security/    - 보안그룹, IAM 역할
│   ├── ecr/         - ECR 레포지토리
│   ├── alb/         - Application Load Balancer (경로 기반 라우팅)
│   ├── ecs/         - ECS 클러스터 + 서비스 + 태스크 정의
│   ├── rds/         - MySQL RDS 인스턴스 (서비스별 DB 분리)
│   ├── logging/     - CloudWatch 로그 그룹
│   ├── storage/     - S3 아티팩트 버킷, EFS
│   └── monitoring/  - CloudWatch 알람
└── envs/
    ├── dev/         ← 현재 배포된 환경 (여기서 apply)
    └── prod/        ← 준비만 됨 (아직 apply 안 함)
```

---

## 파일별 역할

### bootstrap/

| 파일 | 역할 |
|---|---|
| `main.tf` | S3 버킷 생성. 로컬 backend 사용 (S3가 아직 없으므로) |
| `variables.tf` | aws_region, project_name (기본값 있음) |
| `outputs.tf` | 생성된 버킷 이름 출력 + 다음 단계 안내 |

### envs/dev/

| 파일 | 역할 |
|---|---|
| `backend.tf` | "state를 S3에 저장, 경로는 dev/terraform.tfstate" 선언. 버킷 이름은 backend.hcl로 주입 |
| `providers.tf` | AWS provider 설정 |
| `variables.tf` | tfvars에서 받을 변수 타입 정의 (services 구조체, db_username, db_password 등) |
| `terraform.tfvars` | 실제 설정값. 서비스 사양, 환경변수, DB 사용자 이름 등 |
| `main.tf` | 핵심 파일. 모듈 호출 + 서비스별 DB/VITE_API_URL 환경변수 주입 |
| `outputs.tf` | apply 후 출력값 (ALB DNS, ECR URL, 클러스터 이름 등) |

### modules/

각 모듈은 `variables.tf` / `main.tf` / `outputs.tf` 3개 파일로 구성됩니다.

- `variables.tf` — 이 모듈에 넣어줘야 하는 입력값 정의 (어디서 실행할지, 어떤 이름으로 만들지 등)
- `main.tf` — 실제 AWS 리소스 생성
- `outputs.tf` — 만들고 나서 다른 모듈에 전달할 값 정의

| 모듈 | variables.tf 주요 입력값 | main.tf가 만드는 것 | outputs.tf가 반환하는 것 |
|---|---|---|---|
| network | vpc_cidr, azs, subnet_cidrs | VPC, 퍼블릭/프라이빗 서브넷, 인터넷게이트웨이 | vpc_id, subnet_ids |
| security | vpc_id, app_ports | ALB/ECS 보안그룹, IAM Role 2개 | sg_id들, role ARN들 |
| ecr | repositories (목록), force_delete | 서비스별 ECR 레포지토리 | repository_urls |
| alb | vpc_id, subnet_ids, services(경로/포트/헬스체크) | ALB, 타겟그룹, 리스너 규칙 (경로 기반 라우팅) | target_group_arns, alb_dns_name |
| ecs | subnet_ids, sg_id, target_group_arns, services(이미지/환경변수) | ECS 클러스터, 서비스, 태스크 정의 | cluster_name, service_names |
| rds | vpc_id, subnet_ids, ecs_sg_id, db_username, db_password | RDS 서브넷그룹, 보안그룹, MySQL 인스턴스 | endpoint, port, username |
| logging | services (서비스 목록) | CloudWatch 로그 그룹 | log_group_names |
| storage | subnet_ids, ecs_sg_id | S3 아티팩트 버킷, EFS 파일시스템 | bucket_name, efs_id |
| monitoring | cluster_name, service_names | CloudWatch 알람 | alarm ARN들 |

---

## 모듈 간 의존성 흐름

```
network → vpc_id, subnet_ids
    ↓
security → alb_sg_id, ecs_sg_id, role ARNs
    ↓
ecr     logging    rds              alb
(레포)  (로그그룹) (MySQL, endpoint) (DNS, target_group_arns)
    ↓       ↓       ↓                ↓
                  ecs
          (컨테이너 실행 + 환경변수 주입)
                    ↓
                monitoring
```

---

## 서비스별 환경변수 주입 구조 (envs/dev/main.tf)

`terraform.tfvars`의 기본 환경변수 + RDS 접속 정보가 ECS 컨테이너에 자동 merge됩니다.

```
api-node
  tfvars:  NODE_ENV=development, PORT=5000
  + main.tf 주입: DB_TYPE=mysql, DB_HOST=rds-endpoint, DB_NAME=ecommerce_node

api-python
  tfvars:  PORT=8000, STORAGE_TYPE=local, CACHE_TYPE=memory ...
  + main.tf 주입: DB_TYPE=mysql, DB_HOST=rds-endpoint, DB_NAME=ecommerce_python

api-spring
  tfvars:  SPRING_PROFILES_ACTIVE=local, SERVER_PORT=8080
  + main.tf 주입: SPRING_DATASOURCE_URL=jdbc:mysql://rds-endpoint/ecommerce_spring
                  SPRING_DATASOURCE_USERNAME, SPRING_DATASOURCE_PASSWORD

frontend
  tfvars:  {} (없음)
  + main.tf 주입: VITE_API_URL=http://alb-dns-name
```

---

## RDS 구조

RDS 인스턴스는 1개, 서비스별 DB는 따로 분리됩니다.

```
RDS 인스턴스 (devsecops-dev-mysql, db.t3.micro)
  └── MySQL 서버
        ├── ecommerce_node    ← api-node 전용
        ├── ecommerce_python  ← api-python 전용
        └── ecommerce_spring  ← api-spring 전용
```

보안그룹으로 ECS 컨테이너에서만 3306 포트 접근 허용. 외부 접근 차단.

---

## 현재 서비스 상태

| 서비스 | desired_count | 포트 | 헬스체크 | ALB 경로 |
|---|---|---|---|---|
| api-node | 1 | 5000 | `/api/health` | `/api/*`, `/uploads/*` |
| api-python | 1 | 8000 | `/api/health` | `/python*`, `/api/python*` |
| api-spring | 1 | 8080 | `/actuator/health` | `/spring*`, `/api/spring*` |
| frontend | 1 | 80 | `/` | `/*` (기본) |

---

## 실행 순서

### 최초 1회 (환경 구성)

```bash
# 1. S3 state 버킷 생성
cd terraform/bootstrap
terraform init
terraform apply

# 2. backend.hcl 생성 (출력된 버킷 이름 사용)
echo 'bucket = "devsecops-tfstate-xxxxxxxx"' > ../envs/dev/backend.hcl

# 3. dev 환경 초기화
cd ../envs/dev
terraform init -backend-config=backend.hcl
```

### 인프라 배포

```bash
cd terraform/envs/dev

# db_password 환경변수 주입 (git에 저장하지 않음)
export TF_VAR_db_password="원하는비밀번호"

terraform plan
terraform apply
```

### GitHub Actions에서 자동 실행

`terraform/**` 경로 변경 후 push하면 `terraform.yml` 워크플로우가 자동 실행됩니다.
GitHub Secret `TF_VAR_DB_PASSWORD`에 비밀번호를 등록해야 합니다.

---

## name_prefix 네이밍 규칙

`terraform.tfvars`의 `name_prefix = "devsecops-dev"` 값이 모든 리소스 이름을 결정합니다.

| 리소스 | 이름 공식 | 실제 이름 |
|---|---|---|
| ECS 클러스터 | `{name_prefix}-cluster` | `devsecops-dev-cluster` |
| ECS 서비스 | `{name_prefix}-{서비스}` | `devsecops-dev-api-node` |
| Task Definition | `{name_prefix}-{서비스}` | `devsecops-dev-api-node` |
| 컨테이너 이름 | `{서비스}` (prefix 없음) | `api-node` |
| ECR 레포 | `{name_prefix}/{서비스}` | `devsecops-dev/api-node` |
| RDS | `{name_prefix}-mysql` | `devsecops-dev-mysql` |

GitHub Actions 워크플로우에서 이 이름들을 그대로 사용하므로 임의로 바꾸면 배포가 실패합니다.

---

## dev vs prod 차이

| 항목 | dev | prod |
|---|---|---|
| name_prefix | `devsecops-dev` | `devsecops-prod` |
| VPC 대역 | `10.10.0.0/16` | `10.20.0.0/16` |
| desired_count | 1 | 2 (고가용성) |
| CPU/메모리 | 소형 | 2배 |
| ECR force_delete | true | false |
| DB | RDS MySQL (dev용) | RDS MySQL (prod용, 별도) |
| 상태 | 배포 완료 | 미배포 |

---

## Terraform이 만드는 것 vs GitHub Actions가 하는 것

| 작업 | Terraform | GitHub Actions |
|---|---|---|
| ECS 클러스터 생성 | ✅ | ❌ |
| ECS 서비스 생성 (desired_count) | ✅ | ❌ |
| Task Definition 초기 생성 | ✅ | ❌ |
| ECR 레포지토리 생성 | ✅ | ❌ |
| ALB, 네트워크, IAM 등 | ✅ | ❌ |
| Docker 이미지 빌드 & ECR push | ❌ | ✅ |
| ECS에 새 이미지 배포 (Task Def 이미지만 업데이트) | ❌ | ✅ |
| 배포 안정화 확인 | ❌ | ✅ |

한 줄 요약: **Terraform은 그릇(인프라)을 만들고, GitHub Actions는 그 그릇에 앱(이미지)을 채웁니다.**