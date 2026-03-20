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

---

## 4. S3 State가 GitHub Actions와 어떻게 연결되는가

Terraform의 state는 현재 AWS에 무엇이 배포되어 있는지 기록하는 파일입니다. 이 파일이 S3에 저장되어 있어야 GitHub Actions에서 `terraform apply`를 실행할 수 있습니다.

**흐름:**

```
bootstrap/ 실행 (로컬 또는 GitHub Actions bootstrap workflow, 1회)
    → S3 버킷 생성: "devsecops-tfstate-xxxxxxxx"
    → 버킷 이름을 GitHub repository variable에 등록: TF_STATE_BUCKET

terraform apply (로컬 또는 GitHub Actions)
    → backend.hcl에 버킷 이름 주입
    → terraform init -backend-config=backend.hcl
    → S3에서 현재 state 읽기
    → 변경사항만 apply → S3 state 업데이트
```

**backend.tf (envs/dev/)** 는 state를 S3에 저장하겠다는 선언입니다. 버킷 이름은 보안상 코드에 직접 쓰지 않고, 실행 시점에 `backend.hcl` 파일로 주입합니다.

**GitHub Actions에서 backend.hcl 생성 방법 (`terraform-dev-plan-apply.yml` workflow)**:
```yaml
- name: Create backend config
  run: |
    cat > backend.hcl << 'EOF'
    bucket = "${{ vars.TF_STATE_BUCKET }}"
    region = "ap-northeast-2"
    encrypt = true
    EOF

- name: Terraform Init
  run: terraform init -backend-config=backend.hcl
```

`TF_STATE_BUCKET` repository variable에 버킷 이름이 저장되어 있고, workflow 실행 시마다 `backend.hcl` 파일을 동적으로 생성해서 사용합니다.

---

**각 서비스 배포 순서:**
```
1. OIDC 인증
2. ECR 로그인
3. docker build → docker push (git SHA 태그 + latest)
4. AWS에서 현재 Task Definition JSON 다운로드
   → aws ecs describe-task-definition --task-definition devsecops-dev-api-node
5. Task Definition에서 이미지 URI만 교체
   → amazon-ecs-render-task-definition action 사용
6. 새 Task Definition을 AWS에 등록 + ECS 롤링 배포
   → amazon-ecs-deploy-task-definition action 사용
7. 새 태스크가 안정화될 때까지 대기
```
---

## 5. Terraform이 만드는 것 vs GitHub Actions가 하는 것

| 역할 | 담당 |
|---|---|
| ECS 클러스터 생성 | Terraform |
| ECS 서비스 생성 (몇 개 실행할지) | Terraform (desired_count) |
| Task Definition 초기 생성 | Terraform |
| ECR 레포지토리 생성 | Terraform |
| ALB, 네트워크, IAM 등 | Terraform |
| Docker 이미지 빌드 & ECR push | GitHub Actions |
| ECS에 새 이미지 배포 (Task Def 이미지만 업데이트) | GitHub Actions |
| 배포 안정화 확인 | GitHub Actions |

**정리**: Terraform은 인프라를 만들고 유지합니다. GitHub Actions는 코드가 바뀔 때마다 새 이미지를 만들어 기존 인프라에 올립니다. 둘은 서로 건드리는 영역이 다릅니다.

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
| api-spring | 1 | 8080 | `/api/health` | `/spring*`, `/api/spring*` |
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

`terraform/**` 경로 변경 후 push하면 `terraform.yml` workflow가 자동 실행됩니다.
GitHub Secret `TF_VAR_DB_PASSWORD`에 비밀번호를 등록해야 합니다.

---

## name_prefix 네이밍 규칙

`terraform.tfvars`의 `name_prefix = "devsecops-dev"` 값이 모든 리소스 이름을 결정합니다.

| 리소스 | 이름 공식 | 실제 이름 |
|---|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::282146511585:role/GitHubActions-ECR-Role` | bootstrap-terraform-state.yml, terraform-dev-plan-apply.yml, deploy-node-api-ecs.yml |
| `TF_VAR_DB_PASSWORD` | RDS 마스터 비밀번호 | terraform-dev-plan-apply.yml |

`TF_VAR_DB_PASSWORD`는 workflow에서 `TF_VAR_db_password` 환경변수로 매핑되고, Terraform이 이를 자동으로 `var.db_password`에 연결합니다.

### Repository variables

| Variable 이름 | 값 | 어디에 쓰이는지 |
|---|---|---|
| `TF_STATE_BUCKET` | bootstrap workflow가 만든 S3 버킷 이름 | terraform-dev-plan-apply.yml |

> `TF_STATE_BUCKET` 값 확인 방법:
> bootstrap workflow 실행 후 repository variable에 자동 저장됩니다.

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
| `Could not assume role with OIDC` | OIDC IAM 설정 미완 | 8번 과정 다시 확인 |
| `repository does not exist` (ECR) | ECR 레포가 없음 | Terraform apply 확인 |
| `Service not found` | ECS 서비스가 없음 | Terraform apply 확인 |
| `TF_STATE_BUCKET` 관련 에러 | Repository variable 미등록 | bootstrap workflow 및 9번 과정 확인 |
| 배포 후 헬스체크 실패 | 이미지 문제 또는 경로 오류 | ECS 태스크 로그 확인 (CloudWatch) |
| Task Definition 이름 못 찾음 | 이름 불일치 | 3번 name_prefix 섹션 확인 |
