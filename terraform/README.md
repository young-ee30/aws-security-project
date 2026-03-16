# GitHub Actions 인수인계 문서
> Terraform이 어떻게 구성되어 있는지, 그리고 GitHub Actions가 그것과 어떻게 연결되는지를 중심으로 설명합니다.

---

## 1. 전체 구조: 3개 영역의 역할

이 프로젝트는 역할에 따라 3개 영역으로 분리되어 있습니다.

```
📁 terraform/          → 인프라 정의 (ECS, ECR, VPC, ALB 등 AWS 리소스)
📁 .github/workflows/  → 자동화 실행 (코드가 push되면 빌드/배포)
📁 scripts/            → 로컬 수동 작업 (초기 설정, 테스트 push 등)
```

**핵심 개념**: Terraform이 "그릇"을 만들고, GitHub Actions가 거기에 "이미지(앱)"를 채웁니다.

```
Terraform이 먼저 실행되어:
  - ECS 클러스터, 서비스 생성 (컨테이너가 실행될 "자리" 마련)
  - ECR 레포지토리 생성 (이미지를 저장할 "창고" 마련)
  - ALB, 네트워크, 보안그룹 등 인프라 전체 구성

그 이후 GitHub Actions가:
  - 코드 push가 감지되면 Docker 이미지 빌드
  - ECR에 이미지 push
  - ECS 서비스에 새 이미지 배포
```

---

## 2. Terraform 폴더 구조

```
terraform/
├── bootstrap/       ← S3 state 버킷 생성 (딱 한 번만 실행)
├── modules/         ← 재사용 가능한 AWS 리소스 모음
│   ├── network/     - VPC, 서브넷, 라우팅
│   ├── security/    - 보안그룹, IAM 역할
│   ├── ecr/         - ECR 레포지토리
│   ├── alb/         - Application Load Balancer
│   ├── ecs/         - ECS 클러스터 + 서비스 + 태스크
│   ├── logging/     - CloudWatch 로그 그룹
│   ├── storage/     - EFS (공유 스토리지)
│   └── monitoring/  - CloudWatch 알람
└── envs/
    ├── dev/         ← 실제 dev 환경 설정값 (여기서 apply)
    └── prod/        ← prod 환경 설정값 (아직 미사용)
```

### 각 폴더의 역할

**bootstrap/**
S3 state 버킷을 생성하는 코드입니다. Terraform은 실행할 때마다 자신의 상태(state)를 어딘가에 저장해야 하는데, 그 저장소를 S3에 만드는 작업입니다. 이 작업은 프로젝트 처음 시작할 때 딱 한 번만 실행합니다. state 파일이 로컬(`bootstrap/terraform.tfstate`)에 저장됩니다.

**modules/**
실제 AWS 리소스를 만드는 Terraform 코드입니다. 직접 수정하지 않고, `envs/dev/`에서 호출해서 씁니다. 예를 들어 `modules/ecs/main.tf`에는 ECS 클러스터, 서비스, 태스크 정의를 만드는 코드가 있습니다.

**envs/dev/**
dev 환경에서 실제로 `terraform apply`를 실행하는 폴더입니다. `terraform.tfvars`에 어떤 서비스를 얼마나 띄울지 설정하고, `main.tf`에서 modules를 호출합니다.

---

## 3. 핵심: name_prefix가 모든 것을 결정한다

`terraform/envs/dev/terraform.tfvars`에 이 값이 있습니다:

```hcl
name_prefix = "devsecops-dev"
```

이 값 하나로 AWS의 모든 리소스 이름이 정해집니다:

| 리소스 | 이름 공식 | 실제 이름 |
|---|---|---|
| ECS 클러스터 | `{name_prefix}-cluster` | `devsecops-dev-cluster` |
| ECS 서비스 | `{name_prefix}-{서비스명}` | `devsecops-dev-api-node` |
| Task Definition | `{name_prefix}-{서비스명}` | `devsecops-dev-api-node` |
| 컨테이너 이름 | `{서비스명}` (prefix 없음!) | `api-node` |
| ECR 레포 | `{name_prefix}/{서비스명}` | `devsecops-dev/api-node` |

**왜 이게 중요한가**: GitHub Actions 워크플로우에서 이 이름들을 그대로 사용합니다. 예를 들어 `deploy-node-api-ecs.yml`에는 이런 코드가 있습니다:

```yaml
- name: Download current Task Definition
  run: aws ecs describe-task-definition --task-definition devsecops-dev-api-node ...

- uses: aws-actions/amazon-ecs-deploy-task-definition@v2
  with:
    service: devsecops-dev-api-node
    cluster: devsecops-dev-cluster
```

이 값들은 Terraform이 만든 리소스 이름과 **정확히 일치해야** 합니다. 임의로 바꾸면 배포가 실패합니다.

---

## 4. S3 State가 GitHub Actions와 어떻게 연결되는가

Terraform의 state는 현재 AWS에 무엇이 배포되어 있는지 기록하는 파일입니다. 이 파일이 S3에 저장되어 있어야 GitHub Actions에서 `terraform apply`를 실행할 수 있습니다.

**흐름:**

```
bootstrap/ 실행 (로컬 또는 GitHub Actions bootstrap workflow, 1회)
    → S3 버킷 생성: "devsecops-tfstate-xxxxxxxx"

terraform apply (로컬 또는 GitHub Actions)
    → backend.hcl에 버킷 이름 주입
    → terraform init -backend-config=backend.hcl
    → S3에서 현재 state 읽기
    → 변경사항만 apply → S3 state 업데이트
```

**backend.tf (envs/dev/)** 는 state를 S3에 저장하겠다는 선언입니다. 버킷 이름은 보안상 코드에 직접 쓰지 않고, 실행 시점에 `backend.hcl` 파일로 주입합니다.

**GitHub Actions에서 backend.hcl 생성 방법 (`terraform-dev-plan-apply.yml` 워크플로우)**:
```yaml
- name: Resolve state bucket
  run: |
    # TF_STATE_BUCKET이 있으면 그 값을 사용
    # 없으면 devsecops-tfstate- prefix로 S3에서 자동 탐색

- name: Create backend config
  run: |
    cat > backend.hcl << 'EOF'
    bucket = "찾아낸 S3 버킷 이름"
    region = "ap-northeast-2"
    encrypt = true
    EOF

- name: Terraform Init
  run: terraform init -backend-config=backend.hcl
```

`TF_STATE_BUCKET` repository variable은 선택값입니다. 값이 있으면 그 버킷을 사용하고, 값이 없으면 워크플로우가 `devsecops-tfstate-` prefix로 S3 버킷을 자동 탐색해서 `backend.hcl`을 생성합니다.

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

## 6. dev 환경과 prod 환경의 차이

### 왜 나눴는가

같은 `modules/`를 쓰지만, dev와 prod는 설정값이 다릅니다. 개발 중에는 비용을 아끼고 빠르게 테스트할 수 있어야 하고, 실서비스에는 안정성과 성능이 필요하기 때문에 분리합니다.

```
terraform/envs/dev/   ← 현재 실제 배포된 환경
terraform/envs/prod/  ← 준비만 되어 있음 (아직 apply 안 함)
```

### 구체적인 차이점

| 항목 | dev | prod |
|---|---|---|
| `name_prefix` | `devsecops-dev` | `devsecops-prod` |
| VPC 대역 | `10.10.0.0/16` | `10.20.0.0/16` |
| 서비스당 컨테이너 수 (`desired_count`) | **1** | **2** (HA 구성) |
| api-node CPU / 메모리 | 256 / 512 MB | 512 / 1024 MB |
| api-spring CPU / 메모리 | 512 / 1024 MB | 1024 / 2048 MB |
| 환경변수 | `NODE_ENV=development` | `NODE_ENV=production` |
| ECR force_delete | `true` (destroy 때 이미지도 삭제) | `false` (안전 설정) |
| State 파일 위치 | S3 별도 경로 (dev용) | S3 별도 경로 (prod용) |

**네트워크가 완전히 분리됩니다.** dev VPC(`10.10.x.x`)와 prod VPC(`10.20.x.x`)는 서로 다른 네트워크이기 때문에, dev에서 잘못 실행해도 prod에 영향을 주지 않습니다.

**`name_prefix`가 다르기 때문에 리소스 이름도 전부 달라집니다.** dev는 `devsecops-dev-cluster`, prod는 `devsecops-prod-cluster`로 만들어지므로 AWS 콘솔에서도 명확하게 구분됩니다.

**prod는 `desired_count = 2`입니다.** 컨테이너가 2개 실행되어 한 개가 장애나도 서비스가 유지됩니다 (고가용성). dev는 비용 절감을 위해 1개입니다.

### GitHub Actions에서 어떻게 환경을 구분하는가

현재 git actions는 dev 환경 기준으로 작성되어 있습니다. prod 배포를 추가하려면 워크플로우에서 트리거 브랜치나 환경 변수로 분기 처리가 필요합니다. 예를 들어:

```yaml
# 예시: main → dev 배포, release → prod 배포
on:
  push:
    branches: [main, release]

jobs:
  deploy:
    env:
      CLUSTER: ${{ github.ref == 'refs/heads/release' && 'devsecops-prod-cluster' || 'devsecops-dev-cluster' }}
```

현재는 prod 환경 배포 워크플로우가 구현되지 않았으므로, 필요 시 위 패턴을 참고해서 추가하면 됩니다.

---

## 7. 새 서비스 추가할 때 해야 하는 것

예: `api-python` 서비스를 실제로 배포하고 싶을 때

**Step 1 - Dockerfile 작성**
`services/ecommerce-app-python/Dockerfile` 작성

**Step 2 - terraform.tfvars 수정** (`terraform/envs/dev/terraform.tfvars`)
```hcl
api-python = {
  desired_count = 1   # 0에서 1로 변경
  ...
}
```

**Step 3 - terraform apply 실행**
Terraform이 ECS 서비스의 desired_count를 1로 업데이트합니다.

**Step 4 - services/ 코드 push**
GitHub Actions `deploy-node-api-ecs.yml`이 트리거되어 이미지를 빌드하고 ECS에 배포합니다.

---

## 8. OIDC 인증 설정 (현재 미완 - 해야 할 것)

GitHub Actions에서 AWS에 접근할 때 Access Key 대신 OIDC(OpenID Connect)를 사용합니다. 키를 GitHub에 저장하지 않아도 되므로 유출 위험이 없습니다.

```
GitHub Actions 실행
    → "나는 young-ee30/aws-security-project 의 workflow입니다" 라고 AWS에 토큰 제출
    → AWS가 신원 확인 후 임시 자격증명 발급 (1시간 유효)
    → 임시 자격증명으로 ECR push / terraform apply 실행
```

### AWS에서 해야 할 설정 (순서대로)

**① IAM → 자격 증명 공급자 추가** (계정에서 1번만)

| 항목 | 값 |
|---|---|
| 공급자 유형 | OpenID Connect |
| 공급자 URL | `https://token.actions.githubusercontent.com` |
| 대상(Audience) | `sts.amazonaws.com` |

**② IAM Role 생성: GitHub Actions 공용 Role**

- 이름: `GitHubActions-ECR-Role`
- 권한 정책: 실습 단계라면 `AdministratorAccess` 권장
- 이유: bootstrap, Terraform apply, ECR push, ECS deploy를 한 role에서 모두 수행하기 때문
- Trust Policy (아래 JSON 그대로 사용):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::282146511585:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:young-ee30/aws-security-project:*"
      }
    }
  }]
}
```

---

## 9. GitHub Secrets / Variables 등록

레포 → Settings → Secrets and variables → Actions

### Repository secrets

| Secret 이름 | 값 | 어디에 쓰이는지 |
|---|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::282146511585:role/GitHubActions-ECR-Role` | bootstrap-terraform-state.yml, terraform-dev-plan-apply.yml, deploy-node-api-ecs.yml |
| `TF_VAR_DB_PASSWORD` | RDS 마스터 비밀번호 | terraform-dev-plan-apply.yml |

`TF_VAR_DB_PASSWORD`는 워크플로우에서 `TF_VAR_db_password` 환경변수로 매핑되고, Terraform이 이를 자동으로 `var.db_password`에 연결합니다.

### Repository variables

| Variable 이름 | 값 | 어디에 쓰이는지 |
|---|---|---|
| `TF_STATE_BUCKET` | 사용할 state bucket 이름 (선택) | terraform-dev-plan-apply.yml |

> `TF_STATE_BUCKET` 값 확인 방법:
> 필요할 때만 수동으로 등록하면 됩니다. 기본적으로는 Terraform workflow가 S3에서 자동 탐색합니다.

---

## 10. 현재 서비스 상태

| 서비스 | ECS desired_count | 이미지 | 포트 | 헬스체크 |
|---|---|---|---|---|
| api-node | 1 (실행 중) | ECR push 완료 | 5000 | `/api/health` |
| api-python | 0 (중지) | Dockerfile 없음 | 8000 | `/health` |
| api-spring | 0 (중지) | Dockerfile 없음 | 8080 | `/actuator/health` |
| frontend | 0 (중지) | Dockerfile 없음 | 80 | `/` |

---

## 11. 테스트 순서 (OIDC 설정 완료 후)

```
1. services/ecommerce-app-node/ 파일 아무거나 수정
2. git push origin main
3. GitHub → Actions 탭 → "Build & Deploy to ECS" 워크플로우 클릭
4. steps 순서대로 성공 확인:
   - Configure AWS credentials (OIDC 인증)
   - Login to ECR
   - Build and push Docker image
   - Download current task definition
   - Render new task definition
   - Deploy to ECS
   - Wait for service stability
5. AWS 콘솔 → ECS → devsecops-dev-cluster → api-node 서비스
   → Tasks 탭에서 새 태스크 RUNNING 확인
```

---

## 12. 문제 발생 시

| 증상 | 원인 | 해결 |
|---|---|---|
| `Could not assume role with OIDC` | OIDC IAM 설정 미완 | 8번 과정 다시 확인 |
| `repository does not exist` (ECR) | ECR 레포가 없음 | Terraform apply 확인 |
| `Service not found` | ECS 서비스가 없음 | Terraform apply 확인 |
| `TF_STATE_BUCKET` 관련 에러 | 같은 prefix의 S3 버킷이 여러 개이거나 수동 지정이 잘못됨 | `TF_STATE_BUCKET` 값을 명시적으로 지정 |
| 배포 후 헬스체크 실패 | 이미지 문제 또는 경로 오류 | ECS 태스크 로그 확인 (CloudWatch) |
| Task Definition 이름 못 찾음 | 이름 불일치 | 3번 name_prefix 섹션 확인 |
