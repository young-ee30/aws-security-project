# GitHub Actions Flow

이 문서는 현재 저장소의 GitHub Actions가 어떤 순서로 실행되는지, 어떤 조건에서 멈추는지, 그리고 각 workflow가 무슨 역할을 하는지 정리한 운영 문서다.

기준 파일:

- `.github/workflows/bootstrap-terraform-state.yml`
- `.github/workflows/terraform-dev-plan-apply.yml`
- `.github/workflows/ex-ecs-deploy.yml`
- `.github/workflows/pull-request-security-scans.yml`
- `.github/actions/deploy-ecs-service/action.yml`

## 현재 결론

- GitHub Actions에서 `semgrep`은 현재 쓰이지 않는다.
- 현재 보안 스캔은 `Gitleaks`, `Trivy`, `Checkov` 조합이다.
- `main` 또는 `young`에 특정 경로 변경이 push되면 bootstrap이 시작된다.
- bootstrap이 성공하면 Terraform plan/apply workflow가 이어진다.
- Terraform apply가 성공하면 ECS 배포 workflow가 이어진다.
- PR에서는 Terraform plan까지만 가고, apply와 ECS 배포는 하지 않는다.

## Semgrep 사용 여부

현재 `.github/workflows` 와 `.github/actions` 안에는 `semgrep` step이 없다.

실제로 들어가 있는 스캔은 아래뿐이다.

- `gitleaks/gitleaks-action@v2`
- `aquasecurity/trivy-action@master`
- `bridgecrewio/checkov-action@master`

즉 현재 GitHub Actions 기준으로는:

- Secret scan: Gitleaks
- IaC scan: Trivy config mode + Checkov
- Dependency / image scan: Trivy
- Semgrep: 없음

나중에 Semgrep을 붙이려면 보통 아래 둘 중 하나에 넣으면 된다.

- `pull-request-security-scans.yml` 에 PR 정적 분석 job 추가
- `deploy-ecs-service` 전에 서비스 소스코드 정적 분석 job 추가

## 전체 흐름

가장 중요한 자동 흐름은 아래다.

```text
push(main or young, selected paths)
  -> Bootstrap Terraform State
     -> Terraform Dev Plan and Apply
        -> Terraform Apply
           -> Deploy Selected Services to ECS
              -> Deploy ECS Service (composite action)
```

PR 흐름은 아래다.

```text
pull request to main
  -> Pull Request Security Scans
  -> Terraform Dev Plan and Apply
     -> Terraform Plan only
     -> no Terraform Apply
     -> no ECS deploy
```

수동 실행은 아래처럼 독립적으로 가능하다.

```text
workflow_dispatch
  -> bootstrap-terraform-state.yml
  -> terraform-dev-plan-apply.yml
  -> pull-request-security-scans.yml
  -> ex-ecs-deploy.yml
```

## 1. Bootstrap Terraform State

파일:

- `.github/workflows/bootstrap-terraform-state.yml`

트리거:

- `push`
- 대상 브랜치: `main`, `young`
- 대상 경로:
  - `terraform/**`
  - `services/ecommerce-app-node/**`
  - `services/ecommerce-app-fastapi/**`
  - `services/ecommerce-app-spring/**`
  - `services/frontend/ecommerce-app-frontend/frontend/**`
  - `.github/actions/**`
  - `.github/workflows/**`
- `workflow_dispatch`

역할:

- Terraform remote state용 S3 bucket이 있는지 확인한다.
- 있으면 재사용한다.
- 없으면 `terraform/bootstrap` 으로 새로 만든다.

핵심 동작:

1. 저장소 checkout
2. GitHub OIDC로 AWS role assume
3. `vars.TF_STATE_BUCKET` 값이 있으면 그 bucket 존재 여부 확인
4. 값이 없으면 `devsecops-tfstate-{account}-{region}` 규칙으로 목표 bucket 계산
5. bucket이 없으면 `terraform apply` 로 bootstrap
6. summary에 최종 bucket 이름 기록

중요 포인트:

- 이 workflow는 인프라 본체를 배포하지 않는다.
- Terraform이 사용할 state bucket을 준비하는 선행 단계다.
- `push` 트리거는 `young`도 포함하지만, 뒤의 자동 apply 흐름은 사실상 `main` 중심으로 이어진다.

## 2. Terraform Dev Plan and Apply

파일:

- `.github/workflows/terraform-dev-plan-apply.yml`

트리거:

- `workflow_run`
  - 대상 workflow: `Bootstrap Terraform State`
  - `completed`
- `pull_request`
  - 대상 브랜치: `main`
  - 대상 경로:
    - `terraform/**`
    - `.github/actions/**`
    - `.github/workflows/**`
- `workflow_dispatch`

job 구성:

- `terraform-plan`
- `terraform-apply`

### 2-1. terraform-plan

실행 조건:

- bootstrap workflow가 성공했을 때
- 또는 `main` 대상 PR일 때
- 또는 수동 실행일 때

주요 단계:

1. 대상 revision checkout
2. AWS role assume
3. Terraform setup
4. state bucket resolve
5. `TF_VAR_DB_PASSWORD` secret 확인
6. `backend.hcl` 생성
7. `terraform fmt -check`
8. `terraform init`
9. `terraform validate`
10. `Checkov IaC Scan`
11. `terraform plan`

보안 관련:

- 여기서 `Checkov`가 실행된다.
- `security/checkov/custom_policies` 아래 커스텀 정책도 함께 읽는다.
- `soft_fail: true` 라서 위반이 있어도 workflow를 즉시 죽이지는 않는다.

현재 없는 것:

- Semgrep step 없음

### 2-2. terraform-apply

실행 조건:

- `workflow_run` 으로 들어왔고, upstream이 성공했고, upstream event가 `pull_request` 가 아닐 때
- 또는 `workflow_dispatch` 이면서 현재 ref가 `refs/heads/main` 일 때

즉:

- PR에서는 실행 안 됨
- 자동 체인에서는 bootstrap 성공 후 이어짐
- 수동 실행도 `main`에서만 apply 허용

주요 단계:

1. checkout
2. AWS role assume
3. Terraform setup
4. state bucket resolve
5. secret 확인
6. `backend.hcl` 생성
7. `terraform init`
8. orphan IAM role import 시도
9. orphan CloudWatch log group import 시도
10. orphan EFS 정리
11. `terraform apply`

중요 포인트:

- 이 workflow에는 기존 AWS 리소스를 state로 편입하려는 보정 로직이 들어 있다.
- 그래서 단순 apply보다 조금 더 운영 지향적으로 짜여 있다.

## 3. Deploy Selected Services to ECS

파일:

- `.github/workflows/ex-ecs-deploy.yml`

트리거:

- `workflow_run`
  - 대상 workflow: `Terraform Dev Plan and Apply`
  - `completed`
- `workflow_dispatch`

job 구성:

- `resolve-targets`
- `deploy-selected`

### 3-1. resolve-targets

실행 조건:

- Terraform workflow가 성공했고, 그 이벤트가 PR이 아닐 때
- 또는 수동 실행일 때

역할:

- 이번 revision에서 어떤 서비스를 실제로 재배포할지 계산한다.

주요 단계:

1. 배포 대상 SHA 결정
2. 해당 SHA checkout
3. `terraform/envs/dev/terraform.tfvars` 에서 `active_backend` 읽기
4. 변경 파일 기준으로 배포 대상 계산

배포 대상 계산 규칙:

- 아래가 바뀌면 `frontend` 와 `active_backend` 둘 다 배포
  - `terraform/**`
  - `.github/actions/**`
  - `.github/workflows/**`
- 서비스 코드만 바뀌면 해당 서비스만 배포
  - frontend 변경 -> `frontend`
  - node 변경 + active backend가 node -> `api-node`
  - fastapi 변경 + active backend가 python -> `api-python`
  - spring 변경 + active backend가 spring -> `api-spring`
- 첫 commit처럼 이전 commit이 없으면 `frontend` 와 `active_backend` 둘 다 배포
- 아무 대상이 없으면 noop matrix를 만들어 실제 배포를 skip

중요 포인트:

- 이 workflow는 "무조건 다 배포"가 아니다.
- 변경 파일과 `active_backend` 값 기준으로 타겟을 줄인다.

### 3-2. deploy-selected

역할:

- `resolve-targets` 가 만든 matrix를 기준으로 서비스별 배포를 병렬 실행한다.

주요 단계:

1. noop이면 설명만 남기고 종료
2. 대상 revision checkout
3. 서비스별 설정 해석
4. composite action `./.github/actions/deploy-ecs-service` 호출

서비스별로 주입되는 값:

- `app_path`
- `ecr_repository`
- `ecs_service`
- `ecs_cluster`
- `ecs_task_definition`
- `container_name`

## 4. Deploy ECS Service Composite Action

파일:

- `.github/actions/deploy-ecs-service/action.yml`

역할:

- 단일 서비스 이미지 빌드, 스캔, ECR push, ECS 반영까지 실제 작업을 수행한다.

주요 단계:

1. `Gitleaks` 실행
   - 단, `workflow_run` 이벤트에서는 skip
2. AWS role assume
3. ECR login
4. Docker image build
5. `Trivy` 이미지 스캔
6. ECR push
7. 현재 ECS task definition 다운로드
8. 새 image tag로 task definition 렌더링
9. ECS 서비스 배포
10. desired count가 0인 서비스는 scale-up 하지 않음

보안 관련:

- 여기서는 `Gitleaks`, `Trivy` 만 있다.
- Semgrep은 없다.

왜 `workflow_run`에서는 Gitleaks를 skip하나:

- 상위 workflow 체인에서 이미 checkout된 revision을 기준으로 바로 배포까지 넘기기 때문이다.
- 배포 체인 중복 스캔 시간을 줄이려는 의도다.

## 5. Pull Request Security Scans

파일:

- `.github/workflows/pull-request-security-scans.yml`

트리거:

- `pull_request`
  - 대상 브랜치: `main`
- `workflow_dispatch`

job 구성:

- `secret-scan`
- `trivy-iac-scan`
- `trivy-sca-scan`
- `checkov-scan`

각 job의 역할:

- `secret-scan`
  - Gitleaks로 secret 탐지
- `trivy-iac-scan`
  - Terraform / config 스캔
- `trivy-sca-scan`
  - `./services` 기준 dependency / filesystem 스캔
- `checkov-scan`
  - Terraform + custom Checkov policy 스캔

중요 포인트:

- 이 PR 보안 스캔 workflow에도 Semgrep은 없다.
- 대부분 `continue-on-error: true` 또는 soft fail 형태라서, "탐지"와 "리포트" 중심이다.

## 6. 이벤트별 실제 동작

### 6-1. `main` push

조건:

- push 대상이 `main`
- bootstrap workflow의 paths 조건에 걸리는 파일 변경

동작:

1. Bootstrap Terraform State
2. Terraform Plan
3. Terraform Apply
4. ECS 대상 계산
5. 대상 서비스만 ECS 배포

### 6-2. `young` push

조건:

- push 대상이 `young`
- bootstrap workflow의 paths 조건에 걸리는 파일 변경

동작:

1. Bootstrap Terraform State는 실행될 수 있음
2. 이후 Terraform workflow가 `workflow_run` 으로 이어질 수 있음
3. 다만 apply와 ECS 배포는 브랜치/이벤트 조건에 따라 기대와 다를 수 있으니 운영 브랜치로 보기는 어렵다

실무 해석:

- `young`은 bootstrap 테스트 성격이 강하다.
- 실제 자동 반영 체인은 `main` 기준으로 보는 게 안전하다.

### 6-3. `main` 대상 PR

동작:

1. Pull Request Security Scans 실행
2. Terraform Plan 실행
3. Terraform Apply 안 함
4. ECS 배포 안 함

즉 PR은 검증용이다.

### 6-4. 수동 실행

가능:

- state bucket bootstrap
- Terraform plan/apply
- PR security scans
- ECS 선택 배포

특징:

- ECS workflow는 `deploy_frontend`, `deploy_active_backend` 입력으로 수동 제어 가능
- Terraform apply는 `main`에서만 허용되도록 조건이 걸려 있음

## 7. 현재 보안 스캔 체계 요약

PR 검증:

- Gitleaks
- Trivy IaC
- Trivy SCA
- Checkov

Terraform workflow:

- Checkov

서비스 배포 workflow:

- Gitleaks
- Trivy image scan

현재 빠져 있는 것:

- Semgrep
- CodeQL
- SAST 전용 언어별 정적 분석

## 8. 운영 시 기억할 점

- 커스텀 Checkov 정책은 `security/checkov/custom_policies` 에서 읽힌다.
- 정책 YAML을 GitHub에 직접 반영하면 이후 PR scan과 Terraform workflow의 Checkov에서 바로 사용된다.
- ECS 배포 대상은 "모든 서비스"가 아니라 "변경 파일 + active_backend" 기준이다.
- `workflow_run` 체인을 쓰기 때문에 upstream workflow 이름이 바뀌면 downstream 연결이 끊어진다.
- 현재 구조는 IaC 중심 자동화이며, 애플리케이션 정적 분석은 아직 약하다.

## 9. 한 줄 요약

현재 Actions 체인은 `state bucket 준비 -> Terraform plan/apply -> 변경 서비스만 ECS 배포` 구조이고, 보안 스캔은 `Gitleaks + Trivy + Checkov` 조합이며 `Semgrep`은 아직 붙어 있지 않다.
