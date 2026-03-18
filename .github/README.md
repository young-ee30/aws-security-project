# GitHub Actions 전체 흐름 가이드

이 문서는 현재 저장소의 [`.github/workflows`](./workflows), [`.github/actions`](./actions) 가 실제로 어떻게 연결되어 돌아가는지 설명하는 운영 문서입니다.

목표는 하나입니다.

"이 저장소에서 어떤 이벤트가 들어오면, 어떤 workflow가 왜 실행되고, 어디서 멈추며, ECS에는 언제 무엇이 배포되는지"를 이 문서 하나만 읽고 이해할 수 있게 만드는 것.

설명 기준은 문서가 아니라 현재 저장소에 들어 있는 실제 YAML입니다.

## 1. 먼저 전체 지도부터

현재 실제 흐름의 중심은 아래 4개 파일입니다.

- [`workflows/bootstrap-terraform-state.yml`](./workflows/bootstrap-terraform-state.yml)
- [`workflows/terraform-dev-plan-apply.yml`](./workflows/terraform-dev-plan-apply.yml)
- [`workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml)
- [`actions/deploy-ecs-service/action.yml`](./actions/deploy-ecs-service/action.yml)

이 4개를 한 줄로 보면 구조는 이렇게 됩니다.

```text
main push
  -> Bootstrap Terraform State
     -> Terraform Dev Plan and Apply
        -> Deploy Selected Services to ECS
           -> Deploy ECS Service (composite action)
```

PR 흐름은 따로 움직입니다.

```text
pull request to main
  -> Pull Request Security Scans
  -> Terraform Dev Plan and Apply
     -> plan만 실행
     -> apply 안 함
     -> ECS 배포 안 함
```

수동 실행은 사람이 직접 원하는 workflow를 누르는 방식입니다.

```text
manual run
  -> bootstrap-terraform-state.yml
  -> terraform-dev-plan-apply.yml
  -> pull-request-security-scans.yml
  -> ex-ecs-deploy.yml
```

중요한 구분은 아래입니다.

- `workflow`는 언제 실행할지와 어떤 서비스를 처리할지를 결정합니다.
- `action`은 실제 빌드, 스캔, ECR 푸시, ECS 반영을 수행합니다.

즉:

- [`.github/workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml) 은 "무엇을 배포할지" 결정하는 파일
- [`.github/actions/deploy-ecs-service/action.yml`](./actions/deploy-ecs-service/action.yml) 은 "어떻게 배포할지" 실행하는 파일

입니다.

## 2. 어떤 파일이 언제 실행되는가

현재 `.github` 안의 주요 파일 역할은 아래처럼 나뉩니다.

| 파일 | 역할 | 직접 실행 조건 |
|---|---|---|
| [`workflows/bootstrap-terraform-state.yml`](./workflows/bootstrap-terraform-state.yml) | Terraform state bucket 준비 | `main` push, manual run |
| [`workflows/terraform-dev-plan-apply.yml`](./workflows/terraform-dev-plan-apply.yml) | Terraform plan/apply | bootstrap 성공 후 자동, PR, manual run |
| [`workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml) | 이번 실행에서 배포할 서비스 결정 후 ECS 배포 시작 | Terraform workflow 성공 후 자동, manual run |
| [`workflows/pull-request-security-scans.yml`](./workflows/pull-request-security-scans.yml) | PR 보안 검사 | PR, manual run |
| [`actions/deploy-ecs-service/action.yml`](./actions/deploy-ecs-service/action.yml) | 서비스 1개 실제 배포 | `ex-ecs-deploy.yml`이 호출할 때만 실행 |

여기서 가장 많이 헷갈리는 부분은 마지막 줄입니다.

[`.github/actions/deploy-ecs-service/action.yml`](./actions/deploy-ecs-service/action.yml) 은 GitHub Actions 탭에서 혼자 시작되지 않습니다.  
항상 [`.github/workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml) 안에서 `uses: ./.github/actions/deploy-ecs-service` 로 호출될 때만 실행됩니다.

## 3. 이벤트별 전체 흐름

이제부터는 "무슨 이벤트가 들어왔을 때 실제로 무슨 일이 벌어지는가"를 기준으로 설명합니다.

### 3-1. `main` 브랜치에 push한 경우

가장 중요한 자동 배포 흐름입니다.

단, 아무 push나 다 반응하는 것은 아니고 아래 경로가 바뀌었을 때만 시작됩니다.

- `terraform/**`
- `services/ecommerce-app-node/**`
- `services/ecommerce-app-fastapi/**`
- `services/ecommerce-app-spring/**`
- `services/frontend/ecommerce-app-frontend/frontend/**`
- `.github/actions/**`
- `.github/workflows/**`

즉, `main`에 push했더라도 위 경로와 무관한 파일만 바뀌었다면 이 자동 배포 체인은 시작되지 않습니다.

자동 흐름은 아래 순서입니다.

```text
main push
  -> Bootstrap Terraform State
  -> Terraform Dev Plan and Apply
  -> Deploy Selected Services to ECS
  -> 서비스별 Deploy ECS Service action 실행
```

#### Step 1. Bootstrap Terraform State

파일:

- [`workflows/bootstrap-terraform-state.yml`](./workflows/bootstrap-terraform-state.yml)

하는 일:

1. AWS OIDC 인증
2. 이미 사용할 Terraform state bucket이 있는지 확인
3. 있으면 재사용
4. 없으면 `terraform/bootstrap` 으로 새 bucket 생성
5. 어떤 bucket을 쓰게 되었는지 summary에 기록

핵심 포인트:

- `vars.TF_STATE_BUCKET` 이 있으면 그 bucket을 우선 사용하려고 합니다.
- 값이 설정되어 있는데 실제 bucket이 없으면 바로 실패합니다.
- 값이 없으면 `devsecops-tfstate-...` prefix 기준으로 기존 bucket을 찾고, 가장 적절한 bucket을 재사용합니다.
- 아무 bucket도 없으면 bootstrap Terraform으로 새로 만듭니다.

실패하면:

- 여기서 전체 자동 흐름이 멈춥니다.
- 다음 Terraform workflow는 시작되지 않습니다.

성공하면:

- 이름이 정확히 `"Bootstrap Terraform State"` 인 workflow가 성공 완료되었기 때문에
- [`workflows/terraform-dev-plan-apply.yml`](./workflows/terraform-dev-plan-apply.yml) 이 `workflow_run` 으로 이어집니다.

#### Step 2. Terraform Dev Plan and Apply

파일:

- [`workflows/terraform-dev-plan-apply.yml`](./workflows/terraform-dev-plan-apply.yml)

이 workflow는 job이 2개입니다.

- `terraform-plan`
- `terraform-apply`

##### `terraform-plan` 이 하는 일

1. AWS 인증
2. Terraform 설치
3. state bucket 재확인
4. `TF_VAR_DB_PASSWORD` secret 존재 확인
5. `backend.hcl` 생성
6. `terraform fmt -check`
7. `terraform init`
8. `terraform validate`
9. Checkov 실행
10. `terraform plan`

여기서 중요한 점:

- `terraform fmt -check` 는 `continue-on-error: true` 입니다.
- 즉 포맷 문제는 기록되지만 그 이유만으로는 workflow가 멈추지 않습니다.
- 반면 `init`, `validate`, Checkov, `plan` 실패는 실제 실패로 처리됩니다.

##### `terraform-apply` 가 하는 일

`terraform-plan` 이 성공해야 시작됩니다.

그리고 `main` push 자동 흐름에서는 실제 apply까지 갑니다.

실행 순서:

1. AWS 인증
2. Terraform 설치
3. state bucket 재확인
4. secret 확인
5. `backend.hcl` 생성
6. `terraform init`
7. orphan IAM role import 시도
8. orphan CloudWatch Log Group import 시도
9. orphan EFS 정리
10. `terraform apply`

이 단계가 있는 이유:

- 이미 AWS에 있는데 Terraform state에는 없는 리소스 때문에 apply가 깨지는 상황을 줄이기 위해서입니다.
- 즉 "기존 AWS 리소스와 state가 살짝 어긋난 상태"를 보정하려는 로직이 들어 있습니다.

실패하면:

- ECS 배포 workflow는 시작되지 않습니다.
- 인프라 반영이 중간에 멈췄을 수 있으므로 apply 로그를 먼저 확인해야 합니다.

성공하면:

- 이름이 정확히 `"Terraform Dev Plan and Apply"` 인 workflow가 성공 완료되었기 때문에
- [`workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml) 이 `workflow_run` 으로 이어집니다.

#### Step 3. Deploy Selected Services to ECS

파일:

- [`workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml)

이 파일이 현재 ECS 배포의 중심입니다.

이 workflow는 job이 2개입니다.

- `resolve-targets`
- `deploy-selected`

##### `resolve-targets` 가 하는 일

목적은 하나입니다.

"이번 실행에서 어떤 서비스를 배포 대상으로 삼을지" 결정하는 것.

자동 실행일 때 판단 규칙:

1. 현재 기준 커밋 SHA를 잡습니다.
2. 그 커밋과 바로 이전 커밋을 비교해 changed files를 구합니다.
3. 아래 경로가 하나라도 바뀌면 4개 서비스를 모두 배포 대상으로 잡습니다.

- `terraform/**`
- `.github/actions/**`
- `.github/workflows/**`

4. 위 경로가 아니면 서비스별 경로를 보고 해당 서비스만 대상으로 잡습니다.

- `services/ecommerce-app-node/` -> `api-node`
- `services/ecommerce-app-fastapi/` -> `api-python`
- `services/ecommerce-app-spring/` -> `api-spring`
- `services/frontend/ecommerce-app-frontend/frontend/` -> `frontend`

5. 아무 대상도 없으면 `has_targets=false` 로 끝내고 실제 배포 job은 아예 건너뜁니다.

중요한 사실:

- 자동 배포의 변경 감지는 "최신 커밋 vs 그 부모 커밋" 기준입니다.
- 즉 한 번의 push에 여러 commit이 들어오더라도 현재 로직은 마지막 commit 기준으로 대상을 계산합니다.

##### `deploy-selected` 가 하는 일

`resolve-targets` 가 뽑아낸 서비스 목록을 matrix로 하나씩 처리합니다.

서비스마다 먼저 아래 정보를 고정값으로 계산합니다.

- `app_path`
- `ecr_repository`
- `ecs_service`
- `ecs_cluster`
- `ecs_task_definition`
- `container_name`

그 뒤 실제 자동 실행에서는 각 대상 서비스에 대해 바로 배포 action을 호출합니다.

즉 자동 실행에서의 원칙은:

- 대상에 들어온 서비스는 배포
- 대상에 안 들어온 서비스는 미배포

#### Step 4. Deploy ECS Service action

파일:

- [`actions/deploy-ecs-service/action.yml`](./actions/deploy-ecs-service/action.yml)

이 action은 서비스 1개를 실제로 배포하는 엔진입니다.

실행 순서:

1. Gitleaks 실행
2. AWS OIDC 인증
3. ECR 로그인
4. Docker image build
5. Trivy image scan
6. ECR push
7. 현재 ECS task definition 다운로드
8. 새 이미지로 task definition 갱신
9. ECS 서비스 배포
10. desired count가 0이면 1로 올려서 scale from zero 처리

즉 `main` 자동 배포 전체를 문장으로 다시 쓰면 이렇게 됩니다.

> `main`에 배포 관련 변경이 push되면, 먼저 state bucket을 준비하고, 그다음 Terraform plan/apply로 인프라를 반영한 뒤, 마지막에 변경된 서비스만 골라 Docker build와 이미지 스캔을 거쳐 ECS에 새 task definition을 배포한다.

### 3-2. `main`이 아닌 브랜치에 push했고 PR도 없는 경우

이 경우 기본적으로 자동 실행은 없습니다.

이유:

- bootstrap workflow의 `push` 트리거가 `branches: [main]` 이기 때문입니다.

즉:

```text
feature branch push
  -> 자동 실행 없음
```

이 상태에서 뭔가 돌리고 싶다면 manual run을 해야 합니다.

### 3-3. `main` 대상 PR이 열려 있는 브랜치에 push한 경우

이 경우는 "브랜치에 push" 이면서 동시에 "PR 업데이트" 입니다.

현재 PR 흐름은 자동 배포가 아니라 검사 중심 흐름입니다.

기본 큰 그림은 이렇습니다.

```text
PR update
  -> Pull Request Security Scans
  -> Terraform Dev Plan and Apply
     -> 조건이 맞을 때만 실행
     -> plan까지만 실행
  -> apply 없음
  -> ECS 배포 없음
```

하지만 여기에는 중요한 조건 차이가 있습니다.

#### PR Security Scans

파일:

- [`workflows/pull-request-security-scans.yml`](./workflows/pull-request-security-scans.yml)

이 workflow는 `main` 대상 PR이면 실행됩니다.

여기서는 아래 검사를 합니다.

1. Gitleaks secret scan
2. Trivy IaC scan
3. Trivy SCA scan
4. Checkov scan

특징:

- 서비스 코드만 바뀌어도 PR이면 실행됩니다.
- 실제 배포는 하지 않습니다.

#### Terraform Dev Plan and Apply in PR

파일:

- [`workflows/terraform-dev-plan-apply.yml`](./workflows/terraform-dev-plan-apply.yml)

이 workflow는 PR이라고 해서 항상 뜨는 것은 아닙니다.

PR에서 아래 경로가 바뀌었을 때만 시작됩니다.

- `terraform/**`
- `.github/actions/**`
- `.github/workflows/**`

즉:

- PR에서 서비스 코드만 바뀐 경우  
  `pull-request-security-scans.yml` 은 실행되지만  
  `terraform-dev-plan-apply.yml` 은 아예 시작되지 않을 수 있습니다.

- PR에서 Terraform 또는 GitHub Actions 관련 코드가 바뀐 경우  
  `terraform-dev-plan-apply.yml` 이 실행되고 `terraform-plan` 까지 수행합니다.

PR에서 이 workflow가 시작되더라도:

- `terraform-plan` 만 실행
- `terraform-apply` 는 실행 안 함
- `ex-ecs-deploy.yml` 자동 배포로 이어지지 않음

왜냐하면 `ex-ecs-deploy.yml` 은 `workflow_run` 으로 Terraform workflow를 듣고는 있지만, job 조건에서 `workflow_run.event != 'pull_request'` 를 요구하기 때문입니다.

즉 PR 흐름의 한 줄 요약은 아래입니다.

> PR에서는 보안 검사와 Terraform plan까지만 본다. 실제 AWS 변경과 ECS 배포는 하지 않는다.

### 3-4. 사람이 직접 manual run 한 경우

현재 manual run 가능한 workflow는 4개입니다.

- [`workflows/bootstrap-terraform-state.yml`](./workflows/bootstrap-terraform-state.yml)
- [`workflows/terraform-dev-plan-apply.yml`](./workflows/terraform-dev-plan-apply.yml)
- [`workflows/pull-request-security-scans.yml`](./workflows/pull-request-security-scans.yml)
- [`workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml)

각각 의미가 다릅니다.

#### bootstrap manual run

언제 쓰나:

- state bucket을 수동으로 먼저 만들거나 재확인하고 싶을 때

입력값:

- `aws_region`
- `project_name`

결과:

- bucket을 재사용하거나 새로 만듭니다.
- 자동으로 Terraform workflow를 이어서 타게 할 수도 있습니다.

#### terraform manual run

언제 쓰나:

- bootstrap과 무관하게 Terraform을 단독으로 다시 돌려보고 싶을 때

주의:

- `terraform-plan` 은 manual run이면 실행됩니다.
- `terraform-apply` 는 manual run이라도 선택한 ref가 `main` 일 때만 실행됩니다.

즉:

- manual run on `main` -> plan + apply 가능
- manual run on non-`main` branch -> 사실상 plan만 실행

#### PR security scans manual run

언제 쓰나:

- PR이 아니어도 보안 검사를 한 번 수동으로 돌려보고 싶을 때

결과:

- Gitleaks, Trivy, Checkov 검사만 수행합니다.
- 인프라 변경이나 ECS 배포는 하지 않습니다.

#### ECS deploy manual run

파일:

- [`workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml)

이게 운영에서 가장 많이 볼 manual run 입니다.

입력값:

- `deploy_api_node`
- `deploy_api_python`
- `deploy_api_spring`
- `deploy_frontend`

즉 수동 실행 시점에 4개 서비스 중 원하는 것만 `true/false` 로 선택할 수 있습니다.

예:

- node만 배포하고 싶으면 `deploy_api_node=true`
- node + frontend만 배포하고 싶으면 `deploy_api_node=true`, `deploy_frontend=true`

그런데 여기서 중요한 점이 하나 더 있습니다.

수동 실행에서 `true` 로 선택했다고 해서 무조건 배포되지는 않습니다.

선택된 각 서비스에 대해 아래 순서로 다시 판단합니다.

1. Terraform / workflow / action 코드가 바뀌었는가
2. 해당 서비스 소스 코드가 바뀌었는가
3. 현재 ECS 서비스가 이미 떠 있는가

판정 결과:

- 위 조건 중 하나라도 참이면 deploy
- 모두 아니면 skip

즉 manual run의 의미는 아래에 가깝습니다.

> "내가 지정한 서비스 후보들 중에서, 실제로 다시 배포할 필요가 있는 서비스만 배포해라"

예를 들면:

- `api-node=true`, `frontend=true` 로 수동 실행
- 최근 관련 변경이 없고 둘 다 ECS에 정상적으로 떠 있으면
- 둘 다 skip 될 수 있습니다.

반대로:

- `frontend=true` 로 수동 실행
- frontend 관련 코드가 바뀌었거나
- frontend ECS 서비스가 아직 안 떠 있으면
- frontend만 배포됩니다.

## 4. 배포 대상 결정 규칙

ECS 배포가 헷갈리기 쉬운 이유는, 실제로는 "선택" 과 "실행" 이 분리되어 있기 때문입니다.

### 자동 실행에서의 대상 결정

자동 실행은 [`.github/workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml) 의 `resolve-targets` 가 대상을 정합니다.

규칙은 아래와 같습니다.

| 변경 내용 | 결과 |
|---|---|
| `terraform/**` 변경 | 4개 서비스 모두 대상 |
| `.github/actions/**` 변경 | 4개 서비스 모두 대상 |
| `.github/workflows/**` 변경 | 4개 서비스 모두 대상 |
| `services/ecommerce-app-node/**` 변경 | `api-node` 대상 |
| `services/ecommerce-app-fastapi/**` 변경 | `api-python` 대상 |
| `services/ecommerce-app-spring/**` 변경 | `api-spring` 대상 |
| `services/frontend/ecommerce-app-frontend/frontend/**` 변경 | `frontend` 대상 |
| 위에 해당 없음 | 배포 안 함 |

### 수동 실행에서의 대상 결정

수동 실행은 2단계입니다.

1. 사용자가 `true/false` 로 후보 서비스 선택
2. 선택된 각 서비스에 대해 "지금 실제로 배포가 필요한가" 재판단

재판단 기준:

| 조건 | 결과 |
|---|---|
| Terraform / workflow / action 변경 감지 | deploy |
| 선택한 서비스 코드 변경 감지 | deploy |
| ECS 서비스가 미배포 상태 | deploy |
| 위 조건 모두 아님 | skip |

즉 수동 실행은 강제 전체 재배포 버튼이 아니라, 선택한 서비스들에 대한 "스마트 재배포" 버튼에 가깝습니다.

## 5. 실패하면 어디서 멈추는가

운영에서 가장 중요한 부분입니다.

### bootstrap 단계 실패

파일:

- [`workflows/bootstrap-terraform-state.yml`](./workflows/bootstrap-terraform-state.yml)

대표 원인:

- `AWS_ROLE_ARN` 문제로 AWS 인증 실패
- `TF_STATE_BUCKET` 값이 잘못되었거나 bucket이 실제로 없음
- bootstrap Terraform 자체 실패

영향:

- Terraform workflow로 이어지지 않음
- ECS 배포도 없음

### terraform-plan 실패

파일:

- [`workflows/terraform-dev-plan-apply.yml`](./workflows/terraform-dev-plan-apply.yml)

대표 원인:

- state bucket 탐색 실패
- `TF_VAR_DB_PASSWORD` 없음
- `terraform init` 실패
- `terraform validate` 실패
- Checkov 위반
- `terraform plan` 실패

영향:

- `terraform-apply` 시작 안 함
- ECS 배포도 시작 안 함

예외:

- `terraform fmt -check` 실패만으로는 전체가 멈추지 않음

### terraform-apply 실패

대표 원인:

- orphan IAM role import 실패
- orphan Log Group import 실패
- orphan EFS 정리 실패
- `terraform apply` 실패

영향:

- `ex-ecs-deploy.yml` 자동 실행 안 됨
- 인프라가 중간 상태일 수 있으므로 apply 로그 확인이 우선

### PR security scan 실패

파일:

- [`workflows/pull-request-security-scans.yml`](./workflows/pull-request-security-scans.yml)

대표 원인:

- Gitleaks 탐지
- Trivy IaC 탐지
- Trivy SCA 탐지
- Checkov 위반

영향:

- PR check 실패
- 보통 문제를 해결하기 전까지 merge하지 않는 것이 안전

### ECS 배포 단계 실패

파일:

- [`workflows/ex-ecs-deploy.yml`](./workflows/ex-ecs-deploy.yml)
- [`actions/deploy-ecs-service/action.yml`](./actions/deploy-ecs-service/action.yml)

대표 원인:

- Gitleaks 실패
- Docker build 실패
- Trivy image scan 실패
- ECR push 실패
- ECS task definition 반영 실패
- ECS 서비스 안정화 실패

영향:

- 해당 서비스는 실패
- matrix 전략이 `fail-fast: false` 이므로 다른 서비스는 계속 시도할 수 있음
- 하지만 전체 workflow 결과는 실패로 남을 수 있음

## 6. 현재 설정에서 "실패 강도" 는 어느 정도인가

| 항목 | 현재 설정 | 의미 |
|---|---|---|
| Terraform fmt | `continue-on-error: true` | 포맷 문제는 기록만 하고 계속 진행 |
| Gitleaks | 기본 실패 동작 | 시크릿 탐지 시 실패 |
| Trivy IaC | `exit-code: 1` | IaC 취약점 탐지 시 실패 |
| Trivy SCA | `exit-code: 1` | 라이브러리 취약점 탐지 시 실패 |
| Trivy Image | `exit-code: 1` | 이미지 취약점 탐지 시 해당 서비스 배포 실패 |
| Checkov | `soft_fail: false` | 정책 위반 시 실패 |

즉 지금 구조는 "보안 검사가 걸리면 그냥 경고만 찍고 넘어가는 구조"가 아니라, 꽤 엄격하게 막는 구조입니다.

## 7. `.github/actions` 폴더는 왜 있는가

[`.github/actions`](./actions) 는 "공통 작업을 재사용하기 위한 로컬 composite action" 폴더입니다.

현재 실제로 들어 있는 것은 아래 action입니다.

- [`actions/deploy-ecs-service/action.yml`](./actions/deploy-ecs-service/action.yml)

이 파일을 따로 둔 이유는, 서비스가 여러 개여도 배포 절차 자체는 거의 같기 때문입니다.

공통 배포 절차:

1. Gitleaks
2. AWS 인증
3. ECR 로그인
4. Docker build
5. Trivy image scan
6. ECR push
7. ECS task definition 교체
8. ECS deploy

이걸 workflow 파일마다 복붙하지 않고 한 군데에 모아 둔 것입니다.

그래서 구조를 이렇게 이해하면 됩니다.

- `workflows` = 언제 실행할지, 어떤 서비스를 처리할지 결정
- `actions` = 실제 공통 작업 수행

## 8. 운영에서 자주 마주치는 실제 예시

### 예시 1. `main`에 frontend 코드만 push

흐름:

1. bootstrap 실행
2. terraform plan/apply 실행
3. ex-ecs-deploy 실행
4. 변경 파일을 보고 `frontend` 만 대상 선정
5. frontend만 Docker build, scan, push, ECS 배포

### 예시 2. `main`에 Terraform 코드 push

흐름:

1. bootstrap 실행
2. terraform plan/apply 실행
3. ex-ecs-deploy 실행
4. `terraform/**` 변경을 감지
5. `api-node`, `api-python`, `api-spring`, `frontend` 모두 배포 대상 선정
6. 4개 서비스를 각각 배포

### 예시 3. PR에서 서비스 코드만 변경

흐름:

1. pull-request-security-scans 실행
2. terraform workflow는 시작되지 않을 수 있음
3. ECS 배포 없음

핵심:

- PR에서는 서비스 코드 변경만으로 바로 ECS 배포가 일어나지 않습니다.

### 예시 4. 수동으로 node + frontend만 선택 실행

흐름:

1. `deploy_api_node=true`
2. `deploy_frontend=true`
3. 각 서비스에 대해 변경 여부와 현재 ECS 배포 상태 확인
4. 필요한 서비스만 deploy
5. 필요 없으면 skip

즉 "선택한 서비스를 무조건 배포"가 아니라 "선택한 서비스 중 필요한 것만 배포"입니다.

## 9. 필요한 GitHub 설정

Secrets:

- `AWS_ROLE_ARN`
- `TF_VAR_DB_PASSWORD`

Variables:

- `TF_STATE_BUCKET`

자동 제공:

- `GITHUB_TOKEN`

주의:

- `AWS_ROLE_ARN` 이 없으면 bootstrap, terraform, ECS deploy 모두 AWS 접근에서 실패합니다.
- `TF_VAR_DB_PASSWORD` 가 없으면 Terraform plan/apply 가 실패합니다.
- `TF_STATE_BUCKET` 은 선택 사항이지만, 잘못 설정하면 bootstrap이 오히려 실패할 수 있습니다.

## 10. 마지막으로 정말 핵심만 다시 요약

이 저장소의 GitHub Actions를 운영 관점에서 한 줄씩 요약하면 아래와 같습니다.

- `main push` 는 실제 자동 배포 체인이다.
- `PR` 은 검사와 plan 중심 흐름이고, 실제 apply와 ECS 배포는 하지 않는다.
- `ex-ecs-deploy.yml` 이 ECS 배포의 관문이다.
- `deploy-ecs-service/action.yml` 이 실제 배포 엔진이다.
- 자동 배포는 변경된 서비스만, 수동 배포는 선택된 서비스 중 필요한 것만 처리한다.

가장 짧게 압축하면 현재 구조는 아래 문장 하나로 설명할 수 있습니다.

> `main push -> state bucket 준비 -> Terraform 반영 -> 배포 대상 선정 -> 서비스별 ECS 배포`
