# GitHub Actions 워크플로우 설명

이 폴더는 GitHub Actions 자동화 파일을 모아둔 곳입니다.

현재 사용 중인 워크플로우는 아래 4개입니다.

- `bootstrap-terraform-state.yml`
- `terraform-dev-plan-apply.yml`
- `deploy-node-api-ecs.yml`
- `pull-request-security-scans.yml`

## 1. `push` 하면 어떤 일이 일어나나

`main` 브랜치에 `push`했다고 해서 항상 모든 워크플로우가 도는 것은 아닙니다.

아래 경로 중 하나가 바뀌었을 때 자동 배포 체인이 시작됩니다.

- `terraform/**`
- `services/ecommerce-app-node/**`
- `.github/workflows/**`

이 조건에 맞는 `main` push가 발생하면 아래 순서로 실행됩니다.

1. `bootstrap-terraform-state.yml`
2. `terraform-dev-plan-apply.yml`
3. `deploy-node-api-ecs.yml`

즉 흐름은 아래와 같습니다.

1. Terraform state 저장용 S3 버킷이 있는지 확인합니다.
2. 없으면 만들고, 있으면 재사용합니다.
3. 버킷 이름을 GitHub repository variable `TF_STATE_BUCKET`에 저장합니다.
4. `terraform/envs/dev` 기준으로 `terraform fmt`, `init`, `validate`, `plan`, `apply`를 실행합니다.
5. Terraform 적용이 성공하면 Node API Docker 이미지를 빌드합니다.
6. 이미지를 ECR에 push합니다.
7. ECS task definition을 새 이미지로 갱신하고 서비스를 배포합니다.

## 2. 워크플로우 파일별 역할

### `bootstrap-terraform-state.yml`

역할:
- Terraform remote state 용 S3 버킷을 준비합니다.
- 이미 `TF_STATE_BUCKET` 변수에 등록된 버킷이 있으면 그대로 재사용합니다.
- 버킷이 없으면 `terraform/bootstrap`을 실행해서 새로 생성합니다.

언제 실행되나:
- `main` 브랜치 push
- 수동 실행 (`workflow_dispatch`)

주요 동작:
- AWS OIDC 인증
- 기존 state 버킷 존재 여부 확인
- 필요 시 `terraform/bootstrap` 실행
- `TF_STATE_BUCKET` repository variable 저장

필요한 값:
- GitHub Secret: `AWS_ROLE_ARN`

### `terraform-dev-plan-apply.yml`

역할:
- dev 환경 Terraform 인프라를 검사하고 적용합니다.

언제 실행되나:
- `bootstrap-terraform-state.yml` 성공 후 자동 실행
- `main` 대상 pull request
- 수동 실행 (`workflow_dispatch`)

주요 동작:
- AWS OIDC 인증
- `TF_STATE_BUCKET` 변수 확인
- `TF_VAR_DB_PASSWORD` secret 확인
- `backend.hcl` 생성
- `terraform fmt`
- `terraform init`
- `terraform validate`
- Checkov IaC 스캔
- `terraform plan`
- 자동 실행 또는 수동 실행 시 `terraform apply`

필요한 값:
- GitHub Secret: `AWS_ROLE_ARN`
- GitHub Secret: `TF_VAR_DB_PASSWORD`
- GitHub Variable: `TF_STATE_BUCKET`

중요:
- `TF_VAR_DB_PASSWORD`는 GitHub repository secret 이름입니다.
- 워크플로우 안에서는 이 값을 `TF_VAR_db_password` 환경변수로 매핑합니다.
- Terraform은 `TF_VAR_<변수명>` 규칙에 따라 이를 자동으로 `var.db_password`로 읽습니다.

### `deploy-node-api-ecs.yml`

역할:
- Node API 이미지를 빌드하고 ECR에 push한 뒤 ECS에 배포합니다.

언제 실행되나:
- `terraform-dev-plan-apply.yml` 성공 후 자동 실행
- 수동 실행 (`workflow_dispatch`)

주요 동작:
- Gitleaks 스캔
- AWS OIDC 인증
- ECR 로그인
- Docker 이미지 빌드
- Trivy 이미지 스캔
- ECR push
- 현재 ECS task definition 조회
- 새 이미지로 task definition 갱신
- ECS 서비스 배포
- 서비스 desired count가 0이면 1로 올림

필요한 값:
- GitHub Secret: `AWS_ROLE_ARN`

주의:
- 이 워크플로우는 현재 `api-node`만 자동 배포합니다.
- `api-python`, `api-spring`, `frontend`는 이 파일로 자동 배포하지 않습니다.

### `pull-request-security-scans.yml`

역할:
- Pull Request 단계에서 보안 스캔을 실행합니다.

언제 실행되나:
- `main` 대상 pull request
- 수동 실행 (`workflow_dispatch`)

주요 동작:
- Gitleaks secret 스캔
- Trivy IaC 스캔
- Trivy SCA 스캔
- Checkov IaC 스캔

## 3. 필요한 GitHub Secrets / Variables

### Repository secrets

- `AWS_ROLE_ARN`
  GitHub Actions가 AWS에 OIDC로 접근할 때 사용할 IAM Role ARN

- `TF_VAR_DB_PASSWORD`
  Terraform이 RDS 비밀번호로 사용할 값

### Repository variables

- `TF_STATE_BUCKET`
  Terraform state 저장용 S3 버킷 이름

설명:
- `TF_STATE_BUCKET`은 처음부터 직접 넣지 않아도 됩니다.
- `bootstrap-terraform-state.yml`가 처음 실행되면 자동으로 저장합니다.

## 4. 상황별로 어떻게 동작하나

### `main`에 Terraform 파일을 push한 경우

- `bootstrap-terraform-state.yml` 실행
- 성공하면 `terraform-dev-plan-apply.yml` 실행
- 성공하면 `deploy-node-api-ecs.yml` 실행

즉 인프라 확인/적용 후 Node API 이미지 배포까지 이어집니다.

### `main`에 Node API 코드만 push한 경우

- `bootstrap-terraform-state.yml` 실행
- 성공하면 `terraform-dev-plan-apply.yml` 실행
- 성공하면 `deploy-node-api-ecs.yml` 실행

즉 Node 코드만 바꿔도 현재 구조상 bootstrap과 terraform 단계를 먼저 거친 뒤 배포합니다.

### `main`에 전혀 관련 없는 파일만 push한 경우

- 이 폴더의 자동 배포 체인은 실행되지 않습니다.

### Pull Request를 올린 경우

- `pull-request-security-scans.yml` 실행
- Terraform 관련 변경이 있으면 `terraform-dev-plan-apply.yml`의 plan 단계도 실행될 수 있습니다.

## 5. 빠르게 체크할 포인트

배포가 안 될 때는 아래 순서로 보면 됩니다.

1. `AWS_ROLE_ARN` secret이 있는지
2. `TF_VAR_DB_PASSWORD` secret이 있는지
3. `TF_STATE_BUCKET` variable이 생성됐는지
4. Terraform apply가 성공했는지
5. ECS 서비스와 ECR 리포지토리 이름이 Terraform 값과 일치하는지

## 6. 한 줄 요약

현재 구조는 `main`에 관련 파일을 push하면
`state 버킷 준비 -> Terraform plan/apply -> Node API 이미지 빌드/ECR push/ECS 배포`
순서로 자동 실행되도록 되어 있습니다.
