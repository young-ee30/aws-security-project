# GitHub Actions README

이 문서는 이 프로젝트의 GitHub Actions가 실제로 어떻게 동작하는지 쉽게 이해할 수 있도록 정리한 안내서입니다.

설명 기준은 문서가 아니라 현재 저장소에 있는 workflow 파일입니다.

대상 workflow:

- `bootstrap-terraform-state.yml`
- `terraform-dev-plan-apply.yml`
- `deploy-node-api-ecs.yml`
- `deploy-frontend-ecs.yml`
- `pull-request-security-scans.yml`

## 한눈에 보는 구조

이 프로젝트의 자동화는 크게 두 갈래입니다.

1. `main`에 반영된 변경을 실제 AWS에 배포하는 흐름
2. PR 단계에서 위험한 변경을 미리 검사하는 흐름

즉, 보통은 이렇게 이해하면 됩니다.

- `PR`에서는 검사 중심: 보안 스캔, Terraform `plan`
- `main` 반영 후에는 배포 중심: Terraform `apply`, ECS 배포

## 가장 중요한 개념

### `plan`과 `apply`의 차이

- `terraform plan`: 무엇이 바뀔지 미리 계산해서 보여줌
- `terraform apply`: 계산한 변경을 AWS에 실제 반영함

쉽게 말하면:

- `plan` = 시뮬레이션
- `apply` = 실제 실행

### push한다고 항상 배포되지는 않음

다음 조건을 함께 만족해야 자동 배포 체인이 시작됩니다.

- `main` 브랜치에 push
- 변경 파일이 아래 경로 중 하나에 포함

트리거 경로:

- `terraform/**`
- `services/ecommerce-app-node/**`
- `services/frontend/ecommerce-app-frontend/frontend/**`
- `.github/workflows/**`

즉, `docs/**`만 바꾸면 자동 배포 체인은 시작되지 않습니다.

## 전체 흐름

### 1. `main`에 관련 파일 push

배포 관련 파일이 `main`에 push되면 아래 순서로 이어집니다.

1. `bootstrap-terraform-state.yml`
2. `terraform-dev-plan-apply.yml`
3. `deploy-node-api-ecs.yml`
4. `deploy-frontend-ecs.yml`

### 2. PR을 열었을 때

PR에서는 실제 배포 대신 검사 위주로 동작합니다.

1. `pull-request-security-scans.yml`
2. `terraform-dev-plan-apply.yml`의 `plan` job

이때는 `apply`와 ECS 배포는 하지 않습니다.

## 흐름도

```text
main push
  -> Bootstrap Terraform State
     -> state용 S3 bucket 재사용 또는 생성
  -> Terraform Dev Plan and Apply
     -> fmt / init / validate / Checkov / plan
     -> 조건이 맞으면 apply
  -> Deploy Node API to ECS
     -> Docker build / Trivy image scan / ECR push / ECS deploy
  -> Deploy Frontend to ECS
     -> Docker build / Trivy image scan / ECR push / ECS deploy
  -> 사용자는 ALB DNS로 접속
```

```text
PR 생성 또는 PR 브랜치 push
  -> Pull Request Security Scans
     -> Gitleaks / Trivy / Checkov
  -> Terraform Dev Plan and Apply
     -> plan까지만 실행
  -> apply 없음
  -> ECS 배포 없음
```

## 각 workflow 파일의 역할

### `bootstrap-terraform-state.yml`

역할:

- Terraform remote state를 저장할 S3 bucket을 준비합니다.

언제 실행되나:

- `main` push
- 수동 실행 (`workflow_dispatch`)

무슨 일을 하나:

1. 코드 checkout
2. AWS OIDC 인증
3. `TF_STATE_BUCKET` 변수 확인
4. 이미 쓸 수 있는 state bucket이 있으면 재사용
5. 없으면 `terraform/bootstrap`에서 새 bucket 생성
6. 어떤 bucket을 쓸지 결정
7. 작업 요약을 GitHub Actions Summary에 기록

중요 포인트:

- 이 workflow 안에도 `terraform apply`가 있습니다.
- 하지만 이 `apply`는 state bucket이 없을 때만 실행됩니다.
- 버킷이 이미 있으면 새로 만들지 않고 넘어갑니다.

필요한 설정:

- GitHub Secret: `AWS_ROLE_ARN`

### `terraform-dev-plan-apply.yml`

역할:

- dev 환경 Terraform 검증과 실제 인프라 반영을 담당합니다.

언제 실행되나:

- `Bootstrap Terraform State`가 성공적으로 끝난 뒤
- `main` 대상 PR
- 수동 실행 (`workflow_dispatch`)

무슨 일을 하나:

1. 코드 checkout
2. AWS OIDC 인증
3. state bucket 찾기
4. `TF_VAR_DB_PASSWORD` 존재 확인
5. `backend.hcl` 생성
6. `terraform fmt -check`
7. `terraform init`
8. `terraform validate`
9. Checkov IaC 스캔
10. `terraform plan`
11. 조건이 맞으면 `terraform apply`

중요 포인트:

- `plan` job은 PR에서도 실행됩니다.
- `apply` job은 PR에서는 실행되지 않습니다.
- `apply`는 아래 상황에서만 실행됩니다.
  - `Bootstrap Terraform State`가 성공적으로 끝난 뒤 이어진 실행
  - 또는 수동 실행이면서 `main` 브랜치일 때

즉:

- `PR` = 계획 확인
- `main` 반영 후 자동 체인 = 실제 반영 가능

필요한 설정:

- GitHub Secret: `AWS_ROLE_ARN`
- GitHub Secret: `TF_VAR_DB_PASSWORD`
- GitHub Variable: `TF_STATE_BUCKET` 선택 사항

### `deploy-node-api-ecs.yml`

역할:

- Node API 이미지를 빌드하고 ECR에 올린 뒤 ECS 서비스에 배포합니다.

언제 실행되나:

- `Terraform Dev Plan and Apply`가 성공적으로 끝난 뒤
- 수동 실행 (`workflow_dispatch`)

무슨 일을 하나:

1. 코드 checkout
2. Gitleaks 실행
3. AWS OIDC 인증
4. ECR 로그인
5. Docker 이미지 build
6. Trivy로 이미지 취약점 스캔
7. ECR push
8. 현재 ECS task definition 다운로드
9. 새 이미지 SHA로 task definition 갱신
10. ECS 서비스 배포
11. 필요하면 desired count를 1로 올림

중요 포인트:

- PR에서 실행된 Terraform workflow를 따라가서 배포하지 않습니다.
- `workflow_run.event != 'pull_request'` 조건이 있어서 PR 기반 실행은 배포 단계로 연결되지 않습니다.

필요한 설정:

- GitHub Secret: `AWS_ROLE_ARN`

### `deploy-frontend-ecs.yml`

역할:

- Frontend 이미지를 빌드하고 ECR에 올린 뒤 ECS 서비스에 배포합니다.

언제 실행되나:

- `Terraform Dev Plan and Apply`가 성공적으로 끝난 뒤
- 수동 실행 (`workflow_dispatch`)

무슨 일을 하나:

1. 코드 checkout
2. Gitleaks 실행
3. AWS OIDC 인증
4. ECR 로그인
5. Docker 이미지 build
6. Trivy로 이미지 취약점 스캔
7. ECR push
8. 현재 ECS task definition 다운로드
9. 새 이미지 SHA로 task definition 갱신
10. ECS 서비스 배포
11. 필요하면 desired count를 1로 올림

중요 포인트:

- Node API 배포와 구조는 거의 같습니다.
- 실제 서비스 접속은 최종적으로 ALB DNS를 통해 이뤄집니다.

필요한 설정:

- GitHub Secret: `AWS_ROLE_ARN`

### `pull-request-security-scans.yml`

역할:

- PR 단계에서 보안 스캔을 수행합니다.

언제 실행되나:

- `main` 대상 PR
- 수동 실행 (`workflow_dispatch`)

무슨 일을 하나:

1. Gitleaks
2. Trivy IaC Scan
3. Trivy SCA Scan
4. Checkov IaC Scan

중요 포인트:

- 이 workflow는 "실제 배포"가 아니라 "머지 전에 위험 신호 확인"에 초점이 있습니다.

## 보안 확인에 쓰는 3개의 오픈소스 도구

이 프로젝트에서 반복해서 등장하는 핵심 오픈소스 도구는 아래 3개입니다.

### 1. Gitleaks

무엇을 찾나:

- 비밀번호
- API 키
- 토큰
- 하드코딩된 시크릿

왜 필요한가:

- 실수로 코드나 커밋 히스토리에 민감정보를 넣는 사고를 막기 위해

어디서 쓰나:

- `pull-request-security-scans.yml`
- `deploy-node-api-ecs.yml`
- `deploy-frontend-ecs.yml`

걸리면 어떻게 되나:

- 기본적으로 workflow/job 실패로 이어집니다.
- 즉, PR 검사 단계에서는 머지 전에 바로 경고를 줄 수 있고, 배포 workflow에서는 배포가 중단될 수 있습니다.

### 2. Trivy

무엇을 찾나:

- IaC 설정 문제
- 라이브러리 취약점
- 컨테이너 이미지 취약점

왜 필요한가:

- Terraform 설정, 의존성 패키지, Docker 이미지까지 넓게 검사할 수 있기 때문

이 프로젝트에서의 사용 방식:

- `config` 모드: Terraform 같은 IaC 검사
- `fs` 모드: Node.js 의존성 검사
- `image` 모드: Docker 이미지 검사

어디서 쓰나:

- `pull-request-security-scans.yml`
- `deploy-node-api-ecs.yml`
- `deploy-frontend-ecs.yml`

걸리면 어떻게 되나:

- PR용 Trivy IaC Scan: `exit-code: 1` 이라서 `CRITICAL`, `HIGH` 취약점이 잡히면 실패
- PR용 Trivy SCA Scan: `exit-code: 1` 이라서 `CRITICAL`, `HIGH` 취약점이 잡히면 실패
- 배포용 이미지 Trivy Scan: `exit-code: "0"` 이라서 취약점이 보여도 job은 실패하지 않음

즉:

- PR에서는 강하게 막음
- 배포 단계 이미지 스캔은 일단 보여주기 위주

### 3. Checkov

무엇을 찾나:

- Terraform 보안 설정 실수
- IaC 정책 위반
- custom policy 위반

왜 필요한가:

- 인프라 코드를 "배포 전에" 보안 관점에서 검토할 수 있기 때문

어디서 쓰나:

- `terraform-dev-plan-apply.yml`
- `pull-request-security-scans.yml`

걸리면 어떻게 되나:

- 현재 설정은 `soft_fail: true`
- 즉, 문제를 보여주지만 workflow 자체를 실패시키지는 않음

즉:

- 경고는 남김
- 지금 설정으로는 배포를 막지는 않음

## 도구별로 실제로 얼마나 강하게 막는가

| 도구 | 어디서 | 현재 설정 | 결과 |
|---|---|---|---|
| Gitleaks | PR, Node 배포, Frontend 배포 | 기본 실패 동작 | 잡히면 job 실패 가능 |
| Trivy IaC | PR | `exit-code: 1` | `HIGH/CRITICAL`이면 실패 |
| Trivy SCA | PR | `exit-code: 1` | `HIGH/CRITICAL`이면 실패 |
| Trivy Image | 배포 | `exit-code: 0` | 취약점이 있어도 배포 계속 |
| Checkov | PR, Terraform plan/apply | `soft_fail: true` | 경고만 표시, 실패로 처리하지 않음 |
| Terraform fmt | Terraform workflow | `continue-on-error: true` | 포맷 오류가 있어도 다음 단계 계속 |

## "걸리면 어떻게 되는데?"를 상황별로 정리

### 1. PR에서 시크릿이 발견됨

- Gitleaks job 실패 가능
- PR 체크가 빨간색으로 보일 수 있음
- 보통 수정 전까지 머지하지 않는 것이 안전

### 2. PR에서 Terraform 보안 문제 발견됨

- Trivy IaC는 `HIGH/CRITICAL`이면 실패
- Checkov는 경고만 남기고 계속 진행

즉, 같은 IaC 문제라도 어떤 도구가 잡았느냐에 따라 결과가 다를 수 있습니다.

### 3. PR에서 Node 의존성 취약점 발견됨

- Trivy SCA job 실패
- 취약점 수준이 `HIGH/CRITICAL`이면 PR 단계에서 바로 막힘

### 4. 배포 중 이미지 취약점 발견됨

- Trivy 결과는 보이지만 배포가 바로 멈추지는 않음
- 현재는 "알려주되 막지는 않는" 설정

### 5. Checkov에서 문제 발견됨

- 경고는 보임
- 하지만 `soft_fail: true`라서 workflow 자체는 계속 진행

## PR과 main의 차이

| 상황 | plan | apply | ECS 배포 |
|---|---|---|---|
| PR 생성/업데이트 | 실행됨 | 실행 안 됨 | 실행 안 됨 |
| `main`에 관련 파일 push | 실행됨 | 실행될 수 있음 | 실행될 수 있음 |
| `docs/**`만 push | 보통 실행 안 됨 | 실행 안 됨 | 실행 안 됨 |
| 수동 실행 | 실행 가능 | `main`이면 가능 | 가능 |

## 어떤 변경이 실제 배포를 유발하나

자동 배포 체인을 시작시키는 경로는 아래와 같습니다.

- `terraform/**`
- `services/ecommerce-app-node/**`
- `services/frontend/ecommerce-app-frontend/frontend/**`
- `.github/workflows/**`

즉:

- 인프라 코드 변경: 배포 체인 시작 가능
- Node API 변경: 배포 체인 시작 가능
- Frontend 변경: 배포 체인 시작 가능
- workflow 변경: 배포 체인 시작 가능
- 문서 변경만: 시작 안 함

## 최종 사용자는 어디로 접속하나

사용자는 ECR이나 ECS에 직접 붙지 않습니다.

실제 흐름:

1. 브라우저 또는 클라이언트
2. ALB DNS
3. ALB Listener / Target Group
4. ECS Service
5. ECS Task 내부 컨테이너

즉, 최종 접점은 ALB입니다.

## 현재 자동 배포 대상

현재 workflow로 자동 배포가 이어지는 서비스:

- `api-node`
- `frontend`

현재 자동 배포 대상이 아닌 서비스:

- `api-python`
- `api-spring`

## 배포가 잘 되었는지 확인하는 방법

1. GitHub Actions에서 관련 workflow가 성공인지 확인
2. Terraform apply가 실제로 수행됐는지 확인
3. ECS Service가 정상인지 확인
4. ECS Task가 `RUNNING`인지 확인
5. ALB DNS 접속 확인
6. API health check와 Frontend 동작 확인

## 자주 헷갈리는 포인트

### "VSCode에서 push하면 무조건 배포되나요?"

아니요.

정확히는:

- `main`에 push
- 배포 관련 경로 변경
- 필요한 secret/variable 정상

이 조건이 맞아야 배포 체인이 이어집니다.

### "PR에서도 apply 되나요?"

아니요.

PR에서는 Terraform `plan`까지만 돌고, `apply`와 ECS 배포는 하지 않습니다.

### "배포용 보안 스캔은 취약점이 있으면 무조건 멈추나요?"

아니요.

현재 설정상:

- Gitleaks는 강하게 막을 수 있음
- PR의 Trivy는 강하게 막음
- 배포 단계 이미지 Trivy는 알려주기만 하고 막지는 않음
- Checkov는 경고만 남김

## 필요한 GitHub 설정 정리

Secrets:

- `AWS_ROLE_ARN`
- `TF_VAR_DB_PASSWORD`

Variables:

- `TF_STATE_BUCKET` 선택 사항

## 결론

이 프로젝트의 GitHub Actions는 다음 원칙으로 구성되어 있습니다.

- PR에서는 위험한 변경을 먼저 검사한다.
- `main` 반영 후에만 실제 인프라 변경과 배포를 진행한다.
- 보안 도구마다 "경고만 하는 것"과 "실제로 실패시키는 것"이 다르다.

가장 중요한 한 줄 요약:

`PR = 검사 중심`, `main 반영 = apply + ECS 배포 가능`
