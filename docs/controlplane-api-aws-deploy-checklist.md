# Controlplane API AWS Deploy Checklist

이 문서는 현재 저장소 기준으로 `controlplane/api`를 AWS ECS에 올릴 때 필요한 항목만 정리한 체크리스트다.

## 배포 방식

현재 구성은 다음 방식으로 배포된다.

- 컨테이너: ECS Fargate
- 이미지 저장소: ECR
- 진입 경로: ALB path rule
- 배포 workflow: `.github/workflows/ex-ecs-deploy.yml`
- 인프라 provisioning: `terraform/envs/dev`

`controlplane-api`는 기존 ecommerce 백엔드의 `/api/*`와 충돌하지 않도록 `/controlplane/*` 경로로 배포된다.

## 이미 코드에 반영된 것

- `controlplane/api/Dockerfile`
- `controlplane/api/.dockerignore`
- `API_BASE_PATH` 지원
- `FRONTEND_ORIGIN=*` 또는 다중 origin 지원
- Terraform `controlplane-api` ECS 서비스 추가
- Terraform ECS secret env 지원
- ECS task execution role의 Secrets Manager / SSM 읽기 권한 지원
- GitHub Actions `controlplane-api` 배포 타깃 추가

## 먼저 만들어야 하는 AWS 쪽 리소스

1. GitHub Actions가 AssumeRole 할 IAM role
2. Terraform state S3 bucket
3. ECS/ECR/ALB/VPC 인프라
4. `controlplane-api`가 읽을 Secrets Manager secret

## GitHub Repository Secrets / Variables

반드시 필요한 값:

- Secret: `AWS_TERRAFORM_ROLE_ARN`
- Secret: `TF_VAR_DB_PASSWORD`
- Variable: `TF_STATE_BUCKET`

`controlplane-api` 자체 런타임에 필요한 값은 현재 `terraform/envs/dev/terraform.tfvars`의 `controlplane-api` 서비스 항목에서 읽는다.

즉 아래 값은 tfvars 또는 secret ARN으로 맞춰야 한다.

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID` 선택
- `GITHUB_APP_PRIVATE_KEY` secret ARN
- `GEMINI_API_KEY` secret ARN
- `LLM_MODEL`

## Secrets Manager에 넣어야 하는 값

예시:

- `devsecops-dev/controlplane/github-app-private-key`
- `devsecops-dev/controlplane/gemini-api-key`

현재 dev tfvars 예시는 아래 ARN 형식으로 연결되어 있다.

- `arn:aws:secretsmanager:ap-northeast-2:282146511585:secret:devsecops-dev/controlplane/github-app-private-key`
- `arn:aws:secretsmanager:ap-northeast-2:282146511585:secret:devsecops-dev/controlplane/gemini-api-key`

배포 전 실제 ARN과 값으로 바꿔야 한다.

## 실제 순서

1. GitHub App private key를 AWS Secrets Manager에 저장한다.
2. Gemini API key를 AWS Secrets Manager에 저장한다.
3. `terraform/envs/dev/terraform.tfvars`의 `controlplane-api` 블록에서 다음을 실제 값으로 맞춘다.
   - `GITHUB_APP_ID`
   - `GITHUB_APP_CLIENT_ID`
   - secret ARN 두 개
4. `Bootstrap Terraform State` workflow를 한 번 실행한다.
5. `Terraform Dev Plan and Apply`를 실행해 infra를 만든다.
6. `Deploy Selected Services to ECS`를 실행하거나, `controlplane/api/**` 변경을 main/young에 push해서 자동 배포를 탄다.
7. ALB DNS 기준으로 `http://<alb-dns>/controlplane/health`와 `http://<alb-dns>/health`를 확인한다.

## 현재 dev 기준 서비스 값

- ECS service: `devsecops-dev-controlplane-api`
- ECS task definition family: `devsecops-dev-controlplane-api`
- ECR repository: `devsecops-dev/controlplane-api`
- Container port: `4000`
- ALB path: `/controlplane/*`
- Health check: `/health`

## 프런트 연결

`controlplane/web`를 같이 배포할 경우:

- `VITE_API_BASE_URL=https://<your-domain-or-alb>/controlplane`

이렇게 두면 프런트가 `/controlplane/api/...`로 호출하게 된다.

## 주의

- `controlplane-api`는 기존 `active_backend`와 별개다.
- 즉 `api-node`, `api-python`, `api-spring`를 바꾸지 않고도 같이 항상 켜둘 수 있다.
- 기존 `/api/*`는 ecommerce active backend가 그대로 사용한다.
- `controlplane-api`는 `/controlplane/*`만 받는다.

## 배포 후 확인 항목

1. ECS service desired count가 `1` 이상인지 확인
2. Target group health가 `healthy`인지 확인
3. `/controlplane/health` 응답 확인
4. 정책 생성 API 호출 확인
5. GitHub App 연동 확인
6. Gemini 호출 확인
