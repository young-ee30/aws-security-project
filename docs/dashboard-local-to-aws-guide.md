# Dashboard Local MVP -> AWS Guide

이 문서 하나만 따라가면 됩니다.

기준 결정은 아래입니다.

- 지금은 `로컬 백엔드`로 시작
- 나중에 시간 남으면 `AWS`로 올림
- 프론트는 기존 `controlplane/web`를 유지
- 백엔드는 `controlplane/api`에 새로 만듦
- GitHub 인증은 `GitHub App`
- 초기 MVP는 `webhook 없이 polling`

## 1. 이번에 만들 범위

### 필수

- GitHub Actions 실행 목록 조회
- 실패한 run, job, log 조회
- AI 수정 제안 생성
- branch 생성
- PR 생성
- rerun / dispatch
- Confirm 후 실제 코드 자동 반영
- 버튼으로 GitHub Actions 실행
- 버튼으로 AWS 배포 workflow 트리거

### 이번에 안 해도 되는 것

- webhook 실시간 반영
- Prometheus, CloudWatch 대시보드 고도화

## 2. 최종 방향

지금은 로컬로 만들지만, 구조는 나중에 AWS로 올릴 수 있게 아래처럼 잡습니다.

```text
controlplane/
  web/    -> 기존 Vite 대시보드
  api/    -> 새 백엔드
```

역할은 아래처럼 분리합니다.

- `controlplane/web`
  - 화면
  - 버튼
  - 목록
  - 로그 뷰
  - AI 제안 표시

- `controlplane/api`
  - GitHub App 인증
  - Actions runs/logs 조회
  - LLM 호출
  - branch/PR 생성
  - rerun / dispatch
  - workflow dispatch로 GitHub Actions 실행

핵심 원칙:

- 프론트는 GitHub를 직접 호출하지 않음
- 프론트는 LLM을 직접 호출하지 않음
- secret은 백엔드만 가짐

## 3. 왜 로컬로 먼저 가도 되는가

로컬로 먼저 가도 되는 이유:

- 구현 속도가 빠름
- AWS 배포 없이 바로 개발 가능
- GitHub App 연동과 AI 제안 기능부터 검증 가능
- 나중에 API 서버만 AWS로 옮기면 됨
- 로컬에서도 GitHub Actions 실행 버튼은 먼저 붙일 수 있음

단, 아래만 지키면 됩니다.

- `localhost` 하드코딩 최소화
- `.env` 기반 설정
- 프론트와 백엔드 분리
- webhook 대신 polling 사용

## 4. 지금 선택할 기술

### 프론트

- 그대로 사용: `controlplane/web`
- 스택: `Vite + React + TypeScript`

### 백엔드

- 새로 생성: `controlplane/api`
- 권장 스택: `Node.js + TypeScript + Express`

### GitHub 연동

- `GitHub App`
- `octokit`

### AI 연동

- OpenAI 또는 Claude 중 하나
- 초기에는 한 모델만 고정

## 5. GitHub App 먼저 만들기

이 단계는 직접 해야 합니다.

경로:

`Organization Settings -> Developer settings -> GitHub Apps -> New GitHub App`

권장 값:

### 지금 로컬에서 넣을 값

- `GitHub App name`: `devsecops-dashboard-bot-dev`
- `Homepage URL`: `http://localhost:5173`
- `Setup URL`: 비워두거나, 설치 완료 화면을 만들면 `http://localhost:5173/settings/github/installed`
- `Callback URL`: 비움
- `Expire user authorization tokens`: `Off`
- `Request user authorization (OAuth) during installation`: `Off`
- `Enable Device Flow`: `Off`
- `Webhook`: `Off`
- `Webhook URL`: 비움
- `Webhook secret`: 비움
- `Where can this GitHub App be installed?`: `Only on this account`

### 나중에 공용 dev 또는 AWS로 올릴 때 바꿀 값

- `GitHub App name`: `devsecops-dashboard-bot-prod`
- `Homepage URL`: `https://dashboard.your-domain.com`
- `Setup URL`: `https://dashboard.your-domain.com/settings/github/installed`
- `Callback URL`: 기본은 비움. user-to-server authorization이 필요할 때만 `https://dashboard.your-domain.com/settings/github/callback` 또는 API callback 사용
- `Expire user authorization tokens`: 기본은 `Off`. user access token을 실제로 쓸 때만 `On`
- `Request user authorization (OAuth) during installation`: 기본은 `Off`. 설치 직후 사용자 identity/OAuth 권한이 꼭 필요할 때만 `On`
- `Enable Device Flow`: 기본은 `Off`. CLI 또는 headless 인증이 필요할 때만 `On`
- `Webhook`: `On`
- `Webhook URL`: `https://api.your-domain.com/api/github/webhook`
- `Webhook secret`: 랜덤 32자 이상

로컬 기준 설명:

- `Homepage URL`과 `Setup URL`은 브라우저 이동용이므로 `localhost`를 써도 됨
- `Callback URL`은 GitHub 공식 문서 기준 user authorization 후 redirect용이며, user access token을 쓰지 않으면 무시됨
- `Expire user authorization tokens`를 켜면 user access token이 만료되고 refresh token이 같이 발급되지만, 지금 MVP는 installation token만 쓰므로 끄는 편이 단순함
- `Request user authorization (OAuth) during installation`을 켜면 설치 후 `Setup URL` 대신 `Callback URL`로 흐름이 바뀌므로, 현재 설치 완료 페이지(`.../settings/github/installed`)를 쓰는 구조와 맞지 않음
- `Enable Device Flow`는 CLI, 터미널 앱, Git credential helper 같은 headless 인증용이라 현재 브라우저 대시보드에는 불필요
- `Webhook URL`은 GitHub 서버가 호출하므로 `localhost`를 넣으면 안 됨
- 초기 MVP는 polling이므로 webhook을 꺼두는 편이 가장 단순함

권한:

- `Actions: Read & write`
- `Contents: Read & write`
- `Pull requests: Read & write`
- `Metadata: Read-only`
- `workflows: Read & write`

설치:

- `Only select repositories`
- 이 저장소만 설치

생성 후 보관할 값:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_WEBHOOK_SECRET` 선택

로컬에서도 아래 작업은 `GitHub App`으로 처리합니다.

- `controlplane/api`가 installation token으로 workflow runs, jobs, logs 조회
- `controlplane/api`가 branch 생성, commit, push, PR 생성
- 브라우저는 GitHub REST API를 직접 호출하지 않음

## 6. 팀 secret 운영 원칙

### git에 올리는 것

- 코드
- `.env.example`
- 문서

### git에 올리면 안 되는 것

- `.env`
- `.env.local`
- `.pem`
- API key
- private key

### 팀 공유 방법

권장:

- 1Password
- Bitwarden
- 팀 vault

비추천:

- git commit
- 채팅방에 평문 공유

### 누가 secret을 가져야 하나

- 프론트만 작업하는 팀원: 불필요
- 실제 GitHub 연동 테스트할 팀원: 필요
- 팀 리드: 필요

즉, 모든 팀원이 다 받을 필요는 없습니다.

## 7. 로컬 MVP에서 webhook을 빼는 이유

GitHub webhook은 외부에서 접근 가능한 URL이 필요합니다.

로컬 백엔드는 보통 `localhost`라서 GitHub가 직접 호출할 수 없습니다.

그래서 초기 MVP는 아래 방식으로 갑니다.

- 프론트가 주기적으로 API를 다시 호출
- 백엔드가 GitHub에서 최신 run 상태와 로그를 다시 읽음

즉, `polling`으로 갑니다.

장점:

- 구현 간단
- ngrok 불필요
- 팀원마다 webhook URL 안 바꿔도 됨

즉, webhook을 안 쓰는 이유는 기능이 불필요해서가 아니라 로컬 `localhost`가 GitHub에서 직접 접근되지 않기 때문입니다.

실시간 webhook까지 로컬에서 꼭 쓰고 싶다면 아래 중 하나가 필요합니다.

- `ngrok`
- `cloudflared tunnel`
- 공용 dev 서버

## 8. 그럼 로컬에서도 AWS 배포 자동화는 어떻게 하나

가능합니다. 다만 `로컬 PC가 AWS에 직접 배포`하는 구조가 아니라 아래 구조입니다.

```text
Dashboard button
  -> controlplane/api
  -> GitHub App installation token
  -> GitHub Actions workflow_dispatch 또는 rerun API
  -> GitHub Actions가 AWS에 배포
```

핵심:

- 버튼은 `controlplane/api`가 받음
- `controlplane/api`는 GitHub App으로 GitHub API를 호출함
- 실제 AWS 배포는 GitHub Actions가 수행함
- AWS 권한은 로컬이 아니라 GitHub Actions의 OIDC/IAM role이 사용함

즉, 네가 말한 "버튼 누르면 바로 Git Actions 실행"이 맞습니다.

이 저장소 기준으로 연결 대상은 아래입니다.

- `.github/workflows/terraform-dev-plan-apply.yml`
- `.github/workflows/ex-ecs-deploy.yml`

추천 버튼 흐름:

- `Confirm` 버튼
  - AI 수정안 적용
  - branch 생성
  - commit
  - push
  - PR 생성
- `Rerun Failed` 버튼
  - 실패한 run 재실행
- `Deploy` 버튼
  - `workflow_dispatch`로 배포 workflow 실행

주의:

- 로컬이라도 GitHub App 권한과 백엔드 구현만 있으면 배포 버튼은 붙일 수 있음
- 다만 webhook 실시간 갱신은 별도 공개 URL 없이는 polling으로 대체해야 함

## 9. 폴더와 파일 계획

이번에 만들 목표 구조는 아래입니다.

```text
controlplane/
  api/
    package.json
    tsconfig.json
    .env.example
    src/
      server.ts
      config/
        env.ts
      github/
        app.ts
        runs.ts
      llm/
        suggest.ts
      routes/
        health.ts
        github.ts
        fix.ts

  web/
    .env.example
    src/
      pages/
        GitActionsPage.tsx
      hooks/
        useGithubRuns.ts
        useGithubRunDetail.ts
```

## 10. Step 1: controlplane/api 생성

백엔드 생성 명령:

```bash
cd controlplane/api
npm init -y
npm install express cors dotenv octokit
npm install -D typescript tsx @types/node @types/express
npx tsc --init
```

`package.json` scripts 예시:

```json
{
  "scripts": {
    "dev": "tsx src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js"
  }
}
```

이 단계에서 해야 할 일:

- 서버 부팅
- `GET /health`

완료 기준:

- `http://localhost:4000/health`가 `200` 반환

## 11. Step 2: env 파일 추가

`controlplane/api/.env.example`

```env
PORT=4000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173

GITHUB_OWNER=
GITHUB_REPO=
GITHUB_APP_ID=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=

LLM_API_KEY=
LLM_MODEL=
```

`controlplane/web/.env.example`

```env
VITE_API_BASE_URL=http://localhost:4000
```

주의:

- 실제 값은 `.env`에만 넣기
- `.env`는 gitignore 유지

## 12. Step 3: GitHub App 인증 코드 만들기

해야 할 일:

- `GITHUB_APP_ID` 읽기
- `GITHUB_APP_PRIVATE_KEY` 읽기
- repo installation id 조회
- installation token 사용

핵심은 `octokit`으로 설치 토큰 기반 클라이언트를 만드는 것입니다.

완료 기준:

- 서버에서 GitHub repository installation 조회 성공

## 13. Step 4: Actions 조회 API 만들기

먼저 아래 API부터 만듭니다.

```text
GET /health
GET /api/github/runs
GET /api/github/runs/:runId/jobs
GET /api/github/runs/:runId/logs
```

이 API가 반환해야 할 것:

- workflow 이름
- branch
- sha
- status
- conclusion
- created_at
- failed job
- failed step
- raw logs

완료 기준:

- Postman 또는 브라우저에서 run 목록이 보임
- 특정 failed run의 로그를 볼 수 있음

## 14. Step 5: 프론트를 실데이터로 연결

수정 대상:

- `controlplane/web/src/pages/GitActionsPage.tsx`

해야 할 일:

- mock data 제거
- `VITE_API_BASE_URL` 기반 fetch
- run 목록 표시
- 선택한 run의 logs 표시
- loading 상태 추가
- error 상태 추가

이 단계가 끝나면 대시보드에서 진짜 실패 로그를 볼 수 있습니다.

## 15. Step 6: AI 수정 제안 API 만들기

만들 API:

```text
POST /api/github/fix-sessions/:runId/suggest
```

입력:

- run id
- failed step
- logs

출력:

- 원인 요약
- 수정 가능 여부
- 수정 대상 파일 후보
- 제안 diff 초안
- 위험도

초기 프롬프트는 아래 방향이 좋습니다.

- 로그 요약
- root cause 추정
- 수정할 파일 후보
- 실제 코드 변경 초안
- 왜 그 수정이 맞는지

권장 MVP 범위:

- Terraform validate 실패
- Terraform plan 실패
- GitHub workflow yaml 오류
- 명확한 환경변수 누락

이 단계가 끝나면 "AI 수정 제안" 버튼을 눌렀을 때 텍스트 결과가 떠야 합니다.

## 16. Step 7: Confirm 후 실제 코드 자동 반영

이번 기능은 필수입니다.

Confirm 흐름은 아래로 갑니다.

- Confirm 후 branch 생성
- 작업 디렉터리 생성
- AI 제안 기반 수정
- 최소 검증 수행
- commit
- push
- PR 생성

중요:

- 처음부터 `main` 직접 수정 금지
- 자동 반영을 하더라도 항상 `branch -> PR`

권장 branch 이름:

```text
ai-fix/run-<run_id>
```

권장 커밋 메시지:

```text
ai fix: workflow run <run_id>
```

완료 기준:

- 사용자가 `Confirm`을 누르면 실제 Git branch가 생성됨
- 수정 커밋이 push 됨
- PR이 생성됨

## 17. Step 8: rerun / dispatch와 배포 버튼 연결

이 기능도 필수입니다.

만들 API:

```text
POST /api/github/runs/:runId/rerun-failed
POST /api/github/workflows/:workflowId/dispatch
```

이 저장소에는 이미 수동 실행 가능한 workflow가 있습니다.

- `.github/workflows/terraform-dev-plan-apply.yml`
- `.github/workflows/ex-ecs-deploy.yml`

이걸 대시보드 버튼과 연결합니다.

예시:

- `Rerun Failed` -> `/api/github/runs/:runId/rerun-failed`
- `Deploy Frontend` 또는 `Deploy Active Backend` -> `/api/github/workflows/:workflowId/dispatch`

중요:

- 로컬에서 버튼을 눌러도 실제 배포는 GitHub Actions가 수행
- 로컬 백엔드는 GitHub API를 호출해서 workflow를 시작만 함

## 18. 로컬에서 팀원들이 어떻게 쓰나

### 프론트만 필요한 팀원

필요한 것:

- repo clone
- `controlplane/web` 실행
- `VITE_API_BASE_URL`

### 풀기능 테스트 팀원

필요한 것:

- repo clone
- `controlplane/api` 실행
- GitHub App secret
- LLM key

즉, 모든 팀원이 풀기능을 다 실행할 필요는 없습니다.

## 19. 이번 구현 순서

이 순서대로 갑니다.

1. `controlplane/api` 생성
2. `.env.example` 두 개 추가
3. `GET /health`
4. `GET /api/github/runs`
5. `GET /api/github/runs/:runId/jobs`
6. `GET /api/github/runs/:runId/logs`
7. `GitActionsPage.tsx` 실데이터 연결
8. `POST /api/github/fix-sessions/:runId/suggest`
9. `POST /api/github/fix-sessions/:runId/confirm`
10. `POST /api/github/runs/:runId/rerun-failed`
11. `POST /api/github/workflows/:workflowId/dispatch`

## 20. 이번 성공 기준

이번 성공 기준은 아래입니다.

- 대시보드에서 GitHub Actions run 목록이 보인다
- failed run을 누르면 로그가 보인다
- AI 수정 제안이 나온다
- `Confirm` 후 branch/PR 생성이 된다
- 버튼으로 rerun이 된다
- 버튼으로 deploy workflow가 실행된다

## 21. 나중에 AWS로 올릴 때 바뀌는 것

로컬 MVP를 잘 만들면, 나중에 AWS 이관 시 바뀌는 것은 많지 않습니다.

### 그대로 가져가는 것

- 프론트 코드
- 백엔드 코드
- GitHub App 인증 로직
- AI 제안 로직
- API 구조

### 바뀌는 것

- `localhost:4000` -> 실제 API 도메인
- `http://localhost:5173` -> 실제 대시보드 도메인
- `FRONTEND_ORIGIN=http://localhost:5173` -> 실제 프론트 도메인 허용
- 로컬 `.env` -> AWS secret 저장소
- GitHub App의 `Webhook: Off` -> `On`
- GitHub App의 `Webhook URL` 비움 -> 실제 공개 API webhook URL
- polling -> 필요하면 webhook 추가
- 로컬 node 실행 -> ECS/EC2/컨테이너 배포
- 가능하면 `controlplane/api`는 별도 API 서브도메인으로 분리

상세 체크리스트는 `docs/controlplane-api-aws-deploy-checklist.md`를 봅니다.

## 22. AWS 이관 추천 방식

시간이 남으면 아래 방식으로 옮깁니다.

### 추천

- `controlplane/api`를 Dockerize
- ECS Fargate 또는 EC2에 배포
- GitHub App secret은 AWS Secrets Manager 또는 SSM에 저장
- ALB 뒤에 API 노출
- 프론트는 `VITE_API_BASE_URL`만 변경

### 순서

1. `controlplane/api` Dockerfile 추가
2. 환경변수 분리
3. AWS secret 저장
4. API 배포
5. 프론트 env 변경
6. webhook 필요 시 활성화

## 23. 배포 후 Prometheus, CloudWatch는 어떻게 할까

이번 주엔 하지 않아도 됩니다.

하지만 나중에는 아래 방향이 좋습니다.

### Prometheus 데이터

현재처럼 앱이 `/api/metrics`를 노출하면 됩니다.

나중에 AWS에서는 아래 중 하나로 갑니다.

- 간단한 방식:
  - `controlplane/api`가 서비스의 `/api/metrics`를 읽어와서 프론트에 전달
- 더 좋은 방식:
  - ADOT 또는 Prometheus 수집기 도입
  - 중앙 수집 후 API에서 조회

### CloudWatch 데이터

대시보드 프론트가 CloudWatch를 직접 때리지 말고, `controlplane/api`가 AWS SDK로 읽어서 전달합니다.

예시:

- ECS CPU, Memory
- ALB 요청 수
- 에러 수
- Logs Insights 결과

즉, 최종 구조는:

- GitHub 관련 데이터 -> `controlplane/api`
- Prometheus 관련 데이터 -> `controlplane/api`
- CloudWatch 관련 데이터 -> `controlplane/api`
- 프론트는 `controlplane/api`만 호출

## 24. 절대 하지 말 것

- GitHub App private key를 git에 올리지 말 것
- 프론트에서 GitHub 직접 호출하지 말 것
- 프론트에서 LLM 직접 호출하지 말 것
- 자동 반영을 하더라도 `main` 직접 push 금지

## 25. 지금 바로 해야 할 일

아래 두 개부터 시작합니다.

1. `controlplane/api` 초기 서버 생성
2. `controlplane/web`에서 GitActionsPage를 실데이터 구조로 바꿀 준비
3. Confirm / rerun / deploy 버튼 API 연결 준비

## 26. 제일 중요한 한 줄

지금은 `로컬 백엔드 + polling + 실패 로그 조회 + AI 제안 + Confirm 자동 반영 + GitHub Actions 실행 버튼`까지 확실히 만듭니다.

그 다음에 시간이 남으면 `webhook 실시간 반영`, `AWS 이관`, `메트릭 대시보드`를 붙입니다.
