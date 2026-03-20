# Control Plane API AWS Deploy Checklist

이 문서는 `controlplane/api`를 로컬 개발 환경에서 AWS로 옮길 때 무엇을 수정해야 하는지 이 저장소 기준으로 정리한 체크리스트입니다.

전제:

- 로컬 개발 중에는 `controlplane/web -> http://localhost:5173`, `controlplane/api -> http://localhost:4000`
- GitHub App은 로컬 MVP에서는 polling 기준
- AWS 이관 시에도 프론트는 GitHub를 직접 호출하지 않고 `controlplane/api`만 호출

## 1. 가장 먼저 결정할 것

권장 도메인 구조:

```text
https://dashboard.your-domain.com -> controlplane/web
https://api.your-domain.com       -> controlplane/api
```

이유:

- 현재 [terraform/envs/dev/main.tf](../terraform/envs/dev/main.tf)는 기존 서비스용 `/api/*`, `/uploads/*` 경로를 `active_backend`에 연결함
- `controlplane/api`를 같은 `/api/*` 경로에 억지로 넣으면 기존 앱 API와 충돌 가능성이 큼
- 따라서 `controlplane/api`는 별도 API 서브도메인으로 빼는 편이 가장 단순함

## 2. 그대로 가져가는 것

- `controlplane/api`의 GitHub App 인증 로직
- `controlplane/api`의 runs, jobs, logs 조회 API
- AI 수정 제안 API 구조
- `controlplane/web`가 `VITE_API_BASE_URL`로 백엔드를 호출하는 구조
- 초기에는 polling 방식

## 3. GitHub App에서 바꿔야 하는 것

로컬에서 이미 App을 만들었다면 AWS 전환 시 아래를 바꿉니다.

- `GitHub App name`
  로컬: `devsecops-dashboard-bot-dev`
  AWS/shared dev 또는 운영: `devsecops-dashboard-bot-prod`
- `Homepage URL`
  로컬: `http://localhost:5173`
  AWS: `https://dashboard.your-domain.com`
- `Setup URL`
  로컬: 비워두거나 `http://localhost:5173/settings/github/installed`
  AWS: `https://dashboard.your-domain.com/settings/github/installed`
- `Webhook`
  로컬: `Off`
  AWS: `On`
- `Webhook URL`
  로컬: 비움
  AWS: `https://api.your-domain.com/api/github/webhook`
- `Webhook secret`
  로컬: 선택
  AWS: 랜덤 32자 이상으로 생성 후 secret 저장소에 저장

## 4. 백엔드 패키징에서 추가할 것

`controlplane/api`를 AWS에 올리려면 최소 아래 파일이 필요합니다.

- `controlplane/api/Dockerfile`
- `controlplane/api/.dockerignore`
- `controlplane/api/package.json`
  `build`, `start` 스크립트 필요
- `controlplane/api/src/server.ts`
  `PORT` 기반 실행 필요
- `GET /health`
  ECS/ALB health check용

체크:

- 컨테이너가 `0.0.0.0`에 바인딩되는지 확인
- 임시 파일을 쓰더라도 컨테이너 재시작에 의존하지 않는 구조인지 확인
- git clone/push 작업이 있으면 임시 작업 디렉터리 정리 로직 추가

## 5. 로컬 `.env`에서 AWS secret으로 옮길 것

로컬 `.env`에 두던 값은 AWS에서는 Secrets Manager, SSM Parameter Store, ECS task secret 중 하나로 옮깁니다.

최소 목록:

- `PORT`
- `NODE_ENV`
- `FRONTEND_ORIGIN`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `LLM_API_KEY`
- `LLM_MODEL`

권장:

- `PORT`는 태스크 정의와 맞추기
- `NODE_ENV=production`
- `FRONTEND_ORIGIN=https://dashboard.your-domain.com`
- multiline private key는 ECS secret 주입 형식에서 줄바꿈이 유지되는지 확인

## 6. 프론트에서 바꿔야 하는 것

프론트는 큰 구조 변경 없이 base URL만 바꾸면 됩니다.

- `controlplane/web/.env` 또는 배포용 env의 `VITE_API_BASE_URL`
  로컬: `http://localhost:4000`
  AWS: `https://api.your-domain.com`
- 설치 완료 페이지를 쓸 거면 `controlplane/web`에 `/settings/github/installed` 라우트 추가
- CORS 허용 도메인과 실제 프론트 도메인이 일치하는지 확인

## 7. Terraform에서 수정할 것

이 저장소 구조상 Terraform 수정 포인트는 아래가 핵심입니다.

### `terraform/envs/dev/terraform.tfvars`

수정할 것:

- `ecr_repositories`에 `controlplane-api` 추가
- `services`에 `controlplane-api` 항목 추가
  - `cpu`
  - `memory`
  - `container_port`
  - `desired_count`
  - `image`
  - `environment`
  - `priority`
  - `path_patterns`
  - `health_check`

주의:

- 현재 `services`는 기존 앱 서비스만 들어 있음
- `controlplane/api`는 기존 ecommerce API와 목적이 다르므로 `/api/*` 대신 별도 경로 또는 별도 도메인을 권장

### `terraform/envs/dev/main.tf`

확인/수정할 것:

- `local.service_specific_path_patterns`에 `controlplane-api`를 넣을지 결정
- `local.active_backend_public_path_patterns`는 기존 앱용 `/api/*`, `/uploads/*`라서 `controlplane/api`와 분리
- `local.ecs_services`에 들어갈 환경변수 구성 검토
- `module.logging`, `module.monitoring`는 `keys(var.services)` 기반이라 서비스 추가 시 함께 늘어남
- `module.alb`의 path rule 충돌 여부 확인

중요:

- 지금 구조는 `active_backend`가 `api-node`, `api-python`, `api-spring`만 허용됨
- `controlplane/api`를 기존 `active_backend` 체계에 넣지 말고 별도 서비스로 추가하는 편이 안전함

### `terraform/envs/dev/variables.tf`

확인할 것:

- `active_backend` validation은 기존 3개 백엔드만 허용
- `services` object 스키마는 재사용 가능
- `controlplane/api` 전용 변수나 origin/domain 변수가 필요하면 여기에 추가

### `terraform/envs/dev/outputs.tf`

필요 시 추가:

- `controlplane/api`용 공개 URL
- 별도 ALB 또는 Route 53 레코드 정보

## 8. GitHub Actions에서 수정할 것

현재 ECS 배포 흐름은 [`.github/workflows/ex-ecs-deploy.yml`](../.github/workflows/ex-ecs-deploy.yml) 와 [`.github/actions/deploy-ecs-service/action.yml`](../.github/actions/deploy-ecs-service/action.yml) 을 중심으로 돌아갑니다.

선택지는 두 가지입니다.

### 선택지 A. 기존 ECS 배포 workflow에 `controlplane-api` 추가

수정할 것:

- `.github/workflows/ex-ecs-deploy.yml`
  - 서비스 matrix 생성 로직
  - `Resolve service configuration`의 case 문
  - `app_path`
  - `ecr_repository`
  - `ecs_service`
  - `ecs_cluster`
  - `ecs_task_definition`
  - `container_name`

장점:

- 기존 패턴 재사용

주의:

- 현재 workflow는 `active_backend`와 기존 앱 디렉터리 변경 감지에 맞춰져 있음
- `controlplane/api` 변경 감지 경로를 새로 넣어야 함

### 선택지 B. `controlplane/api` 전용 배포 workflow를 새로 만들기

권장 상황:

- 기존 ecommerce 앱 배포와 controlplane 백엔드 배포를 분리하고 싶을 때
- 서비스 경로, 브랜치 전략, 승인 정책을 따로 가져가고 싶을 때

새 workflow에서 필요한 것:

- checkout
- OIDC로 AWS role assume
- Docker build
- ECR push
- ECS task definition image 교체
- ECS service deploy

## 9. AWS 인프라에서 추가할 것

최소 필요:

- `controlplane/api`용 ECR repository
- ECS task definition
- ECS service
- CloudWatch log group
- ALB target group
- 보안 그룹 규칙
- Route 53 record
- ACM 인증서

선택:

- 별도 ALB
- WAF
- autoscaling

## 10. 백엔드 코드에서 AWS 기준으로 확인할 것

- CORS origin이 `localhost`만 허용하지 않도록 변경
- webhook route와 signature 검증 활성화
- health check path가 외부에서도 200 반환
- GitHub App private key 로딩 방식이 ECS secret 주입과 맞는지 확인
- git 작업용 임시 디렉터리가 writable한지 확인
- LLM 호출 timeout, retry, logging 추가
- 로그가 stdout/stderr로 잘 나가서 CloudWatch에서 보이는지 확인

## 11. 프론트와 백엔드 연결 시 변경 순서

권장 순서:

1. `controlplane/api`를 AWS에 먼저 배포
2. `GET /health`와 `GET /api/github/runs`가 공개 도메인에서 동작하는지 확인
3. GitHub App의 `Homepage URL`, `Setup URL`, `Webhook URL` 수정
4. 프론트의 `VITE_API_BASE_URL`을 AWS API 도메인으로 변경
5. 프론트 재배포
6. webhook이 필요하면 활성화

## 12. 배포 전 최종 점검

- `https://api.your-domain.com/health`가 `200`
- `https://api.your-domain.com/api/github/runs`가 인증 후 정상 응답
- GitHub App 설치 저장소가 맞음
- GitHub App webhook delivery가 `2xx`
- `controlplane/web`에서 run 목록이 보임
- 실패 로그 조회가 됨
- branch 생성, commit, push, PR 생성이 실제로 됨
- `main` 직푸시가 아니라 PR 경로로만 반영됨

## 13. 이 저장소에서 가장 자주 놓치는 포인트

- `controlplane/api`를 기존 `/api/*` 라우팅에 그대로 넣으려는 것
- `GITHUB_APP_PRIVATE_KEY` 줄바꿈 형식이 ECS secret 주입 후 깨지는 것
- `FRONTEND_ORIGIN`을 `localhost`로 둔 채 배포하는 것
- `VITE_API_BASE_URL`만 바꾸고 GitHub App의 `Webhook URL`은 안 바꾸는 것
- ECS 서비스는 떴는데 ALB health check path가 안 맞아서 트래픽을 못 받는 것
