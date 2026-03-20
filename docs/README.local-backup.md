# Dashboard AI Fix workflow Guide

이 문서는 `young` 브랜치에서 만들 기능의 기준 문서입니다.

목표는 아래 기능을 대시보드 안에서 처리하는 것입니다.

- GitHub Actions 실행 목록 조회
- 실패한 run, job, log 확인
- AI 수정 제안 생성
- 사용자 Confirm
- 실제 코드 수정
- branch push / PR 생성
- workflow rerun 또는 dispatch

이 문서는 특히 팀 프로젝트 기준으로 아래 질문에 답하도록 작성했습니다.

- 팀원이 각자 `git clone` 하면 어디까지 가능한가
- 공용 git에 코드를 올리면 다 같이 실행 가능한가
- 왜 secret은 git에 올리면 안 되는가
- 로컬 실행만 해야 할 때는 어떻게 운영해야 하는가
- GitHub App은 어떻게 팀 자산으로 운영해야 하는가

## 1. 현재 저장소 상태

현재 저장소 구조는 아래와 같습니다.

- 프론트엔드: `controlplane/web`
- GitHub Actions 화면: `controlplane/web/src/pages/GitActionsPage.tsx`
- 프론트 스택: `Vite + React + TypeScript`
- 백엔드 자리: `controlplane/api`
- 현재 `controlplane/api`는 비어 있음
- 현재 GitHub Actions 페이지는 목업 중심임

즉, 지금 필요한 것은 기존 프론트 위에 실제 백엔드를 붙이고, GitHub App 인증을 통해 GitHub를 제어하는 구조입니다.

## 2. 먼저 결론

현재 제약 조건 기준으로 가장 현실적인 답은 아래입니다.

- 코드는 공용 git에 올린다
- secret은 git에 올리지 않는다
- GitHub App은 팀 자산으로 만든다
- 프론트는 기존 `controlplane/web`를 유지한다
- 백엔드는 `controlplane/api`에 추가한다
- 팀원은 각자 로컬에서 백엔드를 실행한다
- 실제 GitHub 제어는 각자 로컬 백엔드가 수행한다

즉, `git clone`만으로는 화면은 볼 수 있지만 실제 GitHub 제어까지 되지는 않습니다.

## 3. 왜 git clone만으로는 안 되는가

`git clone`으로 공유되는 것은 코드입니다.

공유되지 않거나 git에 올리면 안 되는 것은 아래입니다.

- GitHub App private key
- GitHub App webhook secret
- LLM API key
- 운영용 access token
- 배포용 secret

따라서 아래 두 개는 구분해야 합니다.

- `대시보드 UI를 띄우는 것`
- `GitHub Actions 실행, 로그 조회, PR 생성까지 실제 동작시키는 것`

대시보드 UI만 띄우는 것은 clone 후 프론트 실행만으로 가능합니다.

하지만 실제 GitHub 제어는 아래가 있어야 가능합니다.

- GitHub App secret
- LLM secret
- 이를 들고 있는 서버 코드

즉, 실제 기능은 브라우저가 아니라 서버가 수행합니다.

## 4. 필요한 3요소

이 기능을 만들려면 아래 3개가 동시에 필요합니다.

1. GitHub App
2. 서버 코드
3. 대시보드 UI

역할은 아래와 같습니다.

- `GitHub App`: GitHub 권한과 인증
- `서버 코드`: GitHub API 호출, 로그 수집, LLM 호출, branch/PR 생성
- `대시보드 UI`: 사용자가 보고 승인하는 화면

즉, GitHub App은 열쇠이고 실제 작업은 서버가 합니다.

## 5. 이 브랜치에서의 권장 구조

이 브랜치에서는 `Next.js`로 갈아엎기보다 아래 구조를 권장합니다.

- 프론트: 기존 `controlplane/web` 유지
- 백엔드: `controlplane/api` 신설
- 인증: GitHub App
- AI 호출: 서버에서만 수행

이유는 아래와 같습니다.

- 이미 Vite 기반 대시보드가 있음
- Git Actions 페이지가 이미 있음
- 백엔드만 추가하면 현재 구조를 살릴 수 있음
- 팀플 진행 속도가 더 빠름

권장 구조:

```text
controlplane/
  web/                    # 기존 Vite 대시보드
  api/                    # 새 백엔드

GitHub App
  -> installation token 발급

controlplane/api
  -> GitHub Actions runs 조회
  -> logs 조회
  -> LLM 제안 생성
  -> Confirm 처리
  -> branch 생성 / commit / push / PR 생성
  -> rerun / workflow_dispatch

controlplane/web
  -> run 목록
  -> log detail
  -> AI suggestion
  -> diff preview
  -> confirm button
```

## 6. 팀 프로젝트에서 가능한 운영 방식

팀플에서는 아래 3가지 방식이 있습니다.

### 방식 A. 모두 각자 로컬 풀스택 실행

각 팀원이 아래를 모두 가집니다.

- 소스 코드
- GitHub App secret
- LLM secret
- 로컬 백엔드 실행 환경

장점:

- 각자 독립적으로 개발 가능
- 백엔드 수정 테스트가 빠름

단점:

- secret 배포 범위가 넓어짐
- 설정 실수 가능성이 큼
- webhook 테스트와 공용 상태 확인이 불편함

이 방식은 소규모 팀의 개발용으로는 가능하지만, 운영 형태로는 비추천입니다.

### 방식 B. 공용 dev 백엔드 + 각자 프론트 실행

한 대의 공용 dev 백엔드가 secret을 들고 있습니다.

각 팀원은 아래만 하면 됩니다.

- repo clone
- 프론트 실행
- 프론트에서 공용 dev API 호출

장점:

- 팀원 대부분이 secret 없이도 화면 개발 가능
- GitHub Actions 실행 결과를 같은 기준으로 확인 가능
- 운영 구조와 더 유사함

단점:

- 공용 dev 서버가 필요함
- 백엔드 변경 테스트는 공용 환경 영향을 받을 수 있음

팀 프로젝트 기준 추천 방식이지만, 현재 제약 조건에서는 사용할 수 없습니다.

### 방식 C. 공용 dev 대시보드까지 배포

공용 dev 백엔드뿐 아니라 공용 프론트까지 배포합니다.

각 팀원은 브라우저만 열면 됩니다.

장점:

- 가장 실제 서비스와 유사
- 데모와 발표 준비가 쉬움

단점:

- 배포 자동화와 환경 분리가 필요함

발표용 또는 기업 데모용으로 가장 적합하지만, 현재 제약 조건에서는 제외합니다.

## 7. 팀 프로젝트 기준 추천안

현재 팀플과 "백엔드는 반드시 각자 로컬 실행"이라는 조건을 고려하면 아래 구성이 가장 좋습니다.

### 기본 운영

- 코드: 공용 git
- GitHub App: 팀 공용 1개
- 백엔드: 각자 로컬 실행
- 프론트: 각자 로컬 실행

### 개발 운영

- 모든 팀원이 로컬 백엔드를 띄울 수 있음
- 하지만 모든 팀원이 반드시 secret을 다 받을 필요는 없음
- 실제 기능을 테스트할 사람만 secret을 받아 로컬 실행
- UI 작업자만 필요하면 mock 또는 다른 팀원의 로컬 API를 사용할 수 있음

즉, "코드는 모두 공유"하지만 "secret은 필요한 사람만 제한적으로 공유"하는 구조가 맞습니다.

## 8. 누가 무엇을 가져야 하나

팀원별로 필요한 것은 다릅니다.

### 모든 팀원에게 필요한 것

- git repo 접근 권한
- 프론트 실행 환경
- 대시보드 사용 방법

### 실제 GitHub 연동까지 테스트할 팀원에게 필요한 것

- `controlplane/api` 실행 환경
- GitHub App 관련 secret
- LLM secret

### 운영 담당자 또는 팀 리드에게 필요한 것

- GitHub App 생성/관리 권한
- GitHub 설치/권한 승인 권한
- 공용 dev 서버 secret 주입 권한

## 9. 팀원 로컬 실행 시나리오

### 시나리오 1. 프론트만 로컬 실행

가능합니다.

이 경우:

- 팀원은 `controlplane/web`만 실행
- API는 mock 또는 다른 팀원이 띄운 로컬 API를 바라봄
- GitHub App secret은 없어도 됨

필요한 값은 보통 아래 하나면 충분합니다.

```env
VITE_API_BASE_URL=http://localhost:4000
```

### 시나리오 2. 프론트 + 백엔드 둘 다 로컬 실행

가능합니다.

이 경우:

- `controlplane/web` 실행
- `controlplane/api` 실행
- GitHub App secret 필요
- LLM secret 필요

이 방식은 백엔드 개발자나 팀 리드 정도만 사용하는 것이 좋습니다.

### 시나리오 3. 모든 팀원이 풀기능을 각자 로컬에서 실행

가능합니다.

이 경우:

- 모든 팀원이 동일한 백엔드 코드를 실행
- 모든 팀원이 GitHub App secret과 LLM secret을 로컬에 보유
- 같은 repo에 대해 각자 rerun, dispatch, PR 생성 가능

주의:

- 실수로 서로 같은 workflow를 중복 실행할 수 있음
- 같은 branch나 PR 이름을 쓰면 충돌 가능
- shared key를 많이 배포할수록 유출 위험이 커짐

따라서 가능한 한 `풀기능 테스트 담당자`를 정하고, 나머지는 프론트 위주로 작업하는 것이 좋습니다.

## 10. 공용 git에 올려도 되는 것과 안 되는 것

### git에 올려도 되는 것

- 프론트 코드
- 백엔드 코드
- API route 코드
- GitHub App 연동 로직
- `.env.example`
- 문서

### git에 올리면 안 되는 것

- `.env`
- `.env.local`
- `.pem` private key
- OpenAI API key
- GitHub App webhook secret
- 운영 토큰

즉, "백엔드 코드를 git에 올리는 것"은 가능하지만, "실행용 secret까지 git에 같이 올리는 것"은 하면 안 됩니다.

## 11. 팀 secret은 어떻게 공유하나

권장 방식은 아래 중 하나입니다.

- 1Password
- Bitwarden
- 회사 또는 팀 secret manager
- 최소한 접근 통제가 가능한 공유 vault

비추천:

- git commit
- 일반 채팅방에 raw secret 붙여넣기
- `.pem` 파일을 아무 폴더에 복사해서 전달

권장 원칙:

- dev secret과 prod secret 분리
- secret 접근자는 최소화
- 노출되면 바로 rotate
- 문서에는 변수 이름만 남기고 실제 값은 넣지 않음

현재 제약 조건에서는 아래처럼 운영하는 것이 좋습니다.

- `dev` GitHub App 1개 생성
- `dev` LLM key 1개 또는 사용자별 LLM key 사용
- 실제 로컬 풀기능 테스트가 필요한 사람만 vault에서 값을 받아 `.env`에 입력
- 테스트 종료 후 key 노출이 의심되면 rotate

중요:

- `GITHUB_APP_ID`는 사실상 민감도가 낮습니다
- 진짜 민감한 값은 아래 3개입니다

```text
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
LLM_API_KEY
```

## 12. GitHub App은 누구 명의로 만들어야 하나

가장 좋은 것은 `개인 계정`이 아니라 `팀 organization` 기준으로 만드는 것입니다.

이유:

- 특정 개인이 나가도 운영이 끊기지 않음
- 팀 자산으로 관리 가능
- 설치와 권한 관리가 깔끔함

권장:

- 팀 organization 아래 GitHub App 생성
- 팀 repo에 설치
- 공용 dev / 향후 prod 운영

비추천:

- 특정 개인 계정에 귀속된 App
- 발표 후 사라질 수 있는 App

## 13. dev와 prod는 분리할 것

가능하면 아래처럼 분리하는 것이 좋습니다.

- `devsecops-dashboard-bot-dev`
- `devsecops-dashboard-bot-prod`

이유:

- 실수로 운영 repo를 건드릴 가능성 감소
- secret 관리가 쉬움
- 데모와 운영을 나눌 수 있음

최소한 아래는 분리해야 합니다.

- 설치 대상 repo
- secret
- API base URL
- branch protection 정책

## 14. GitHub App 생성과 설치

GitHub에서 아래 경로로 이동합니다.

`Organization Settings -> Developer settings -> GitHub Apps -> New GitHub App`

권장 입력:

- `GitHub App name`: `devsecops-dashboard-bot-dev`
- `Homepage URL`: 추후 대시보드 주소
- `Setup URL`: 추후 대시보드 주소
- `Webhook`: 활성화
- `Webhook URL`: 추후 API 주소
- `Webhook secret`: 랜덤 문자열

권장 권한:

- `Actions`: Read & write
- `Contents`: Read & write
- `Pull requests`: Read & write
- `Metadata`: Read-only
- `workflows`: Read & write

설치 시에는 `Only select repositories`로 필요한 저장소만 선택합니다.

이 단계는 사용자가 직접 해야 합니다.

## 15.5. 로컬 전용 운영에서 webhook은 어떻게 할까

이 부분이 중요합니다.

GitHub App webhook은 기본적으로 외부에서 접근 가능한 URL이 필요합니다. `localhost`는 GitHub가 바로 호출할 수 없습니다.

따라서 로컬 전용 운영에서는 아래 둘 중 하나를 선택해야 합니다.

### 선택지 A. 초기 MVP는 webhook 없이 polling

권장합니다.

방식:

- 대시보드가 주기적으로 `/api/github/runs`를 호출
- 백엔드가 GitHub API에서 run 상태를 다시 읽음
- 로그도 필요할 때마다 직접 조회

장점:

- ngrok 같은 터널이 필요 없음
- 팀원마다 webhook URL 관리 안 해도 됨
- 구현이 단순함

단점:

- 실시간성은 조금 떨어짐

### 선택지 B. ngrok 또는 cloudflared tunnel 사용

가능합니다.

방식:

- 각자 로컬 백엔드를 터널로 외부 공개
- GitHub App webhook URL을 해당 터널 주소로 설정

단점:

- 팀원마다 URL이 바뀜
- GitHub App 설정을 자주 바꿔야 함
- 팀 전체 개발 방식으로는 번거롭고 불안정함

결론:

- 로컬 전용 팀플 MVP는 `webhook 없이 polling`이 가장 낫습니다
- webhook은 나중에 공용 dev 또는 배포 환경에서 붙이는 것이 좋습니다
## 16. controlplane/api에 둘 환경 변수

백엔드에는 최소 아래 값들이 필요합니다.

```env
PORT=4000
NODE_ENV=development

GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_OWNER=
GITHUB_REPO=

LLM_API_KEY=
LLM_MODEL=
```

webhook을 안 쓰는 초기 MVP라면 `GITHUB_WEBHOOK_SECRET`은 당장 필수는 아닙니다.

webhook까지 붙일 때만 추가합니다.

프론트에는 보통 아래 정도면 됩니다.

```env
VITE_API_BASE_URL=http://localhost:4000
```

권장 사항:

- `controlplane/api/.env.example` 추가
- `controlplane/web/.env.example` 추가
- 실제 `.env` 파일은 gitignore 유지

이 작업은 `(제 도움을 받아보세요)`.

## 17. 이 저장소에서 구현할 백엔드 책임

`controlplane/api`는 아래를 담당합니다.

- GitHub App 인증
- installation token 발급
- workflow runs 조회
- run jobs 조회
- logs 조회
- AI suggestion 생성
- Confirm 처리
- branch 생성
- commit / push
- PR 생성
- rerun / workflow_dispatch
- webhook 수신 및 검증

초기 MVP에서는 webhook 없이도 충분하므로, 우선순위는 아래 순서가 좋습니다.

1. runs 조회
2. logs 조회
3. AI suggestion
4. confirm -> PR
5. rerun / dispatch
6. webhook

즉, 실제 핵심은 여기 있습니다.

## 18. 추천 API 엔드포인트

최소 엔드포인트는 아래 정도면 충분합니다.

```text
GET    /health
GET    /api/github/runs
GET    /api/github/runs/:runId/jobs
GET    /api/github/runs/:runId/logs
POST   /api/github/runs/:runId/rerun-failed
POST   /api/github/workflows/:workflowId/dispatch
POST   /api/github/fix-sessions/:runId/suggest
POST   /api/github/fix-sessions/:runId/confirm
POST   /api/github/webhook
```

이 작업은 `(제 도움을 받아보세요)`.

초기 로컬 전용 MVP에서는 아래만 먼저 만들어도 됩니다.

```text
GET    /health
GET    /api/github/runs
GET    /api/github/runs/:runId/jobs
GET    /api/github/runs/:runId/logs
POST   /api/github/fix-sessions/:runId/suggest
POST   /api/github/fix-sessions/:runId/confirm
POST   /api/github/runs/:runId/rerun-failed
POST   /api/github/workflows/:workflowId/dispatch
```

## 19. 구현 단계

### Step 1. GitHub App 만들기

사용자가 직접 해야 하는 단계입니다.

### Step 2. controlplane/api 기본 서버 만들기 `(제 도움을 받아보세요)`

해야 할 일:

- `controlplane/api`에 실제 백엔드 추가
- 런타임 선택
- 환경 변수 로딩
- health check 추가

권장:

- Node.js + TypeScript
- Express 또는 Fastify

### Step 3. GitHub App 인증 코드 추가 `(제 도움을 받아보세요)`

해야 할 일:

- App ID 읽기
- private key 읽기
- installation token 발급
- 특정 repo 설치 여부 확인

### Step 4. GitHub Actions runs, jobs, logs API 구현 `(제 도움을 받아보세요)`

해야 할 일:

- 최근 workflow run 목록 조회
- 실패한 job, step 확인
- log 다운로드 및 가공

### Step 5. GitActionsPage를 실데이터 기반으로 변경 `(제 도움을 받아보세요)`

현재 파일:

- `controlplane/web/src/pages/GitActionsPage.tsx`

해야 할 일:

- mock data 제거
- 백엔드 API 호출
- run 목록 렌더링
- 선택된 run 로그 표시
- loading / error 상태 추가

### Step 6. AI suggestion API 구현 `(제 도움을 받아보세요)`

최소 API:

- `POST /api/github/fix-sessions/:runId/suggest`

초기 범위는 좁히는 것이 좋습니다.

권장 MVP 범위:

- Terraform validate/plan 실패
- workflow yaml 문법 오류
- 환경 변수 누락 같은 명확한 문제

### Step 7. Confirm 후 실제 코드 변경 플로우 구현 `(제 도움을 받아보세요)`

최소 API:

- `POST /api/github/fix-sessions/:runId/confirm`

이 API가 해야 할 일:

1. 새 branch 생성
2. 작업 디렉터리 checkout
3. AI 제안 기준 파일 수정
4. 기본 검증 실행
5. commit
6. push
7. PR 생성

권장 branch 이름:

```text
ai-fix/run-<run_id>
```

권장 커밋 메시지:

```text
ai fix: workflow run <run_id>
```

주의:

- `main` 직접 push 금지
- 항상 PR 기반

### Step 8. rerun / dispatch 연결 `(제 도움을 받아보세요)`

최소 API:

- `POST /api/github/runs/:runId/rerun-failed`
- `POST /api/github/workflows/:workflowId/dispatch`

이 저장소에는 이미 수동 실행 가능한 workflow가 있으므로 연결이 가능합니다.

대상 예시:

- `.github/workflows/terraform-dev-plan-apply.yml`
- `.github/workflows/ex-ecs-deploy.yml`

### Step 9. webhook은 나중에 붙이기

현재 제약 조건이 "각자 로컬 백엔드"이므로, webhook은 1차 목표에서 제외하는 것이 좋습니다.

우선은 polling 기반으로 구현합니다.

필요 시 이후 단계에서:

- ngrok 또는 cloudflared tunnel 사용
- 혹은 공용 dev 환경으로 이동 후 webhook 활성화

### Step 10. PR 승인 정책 정리

사용자가 GitHub에서 직접 해야 할 일:

- `main` 보호 브랜치 설정
- `Require a pull request before merging`
- `Require status checks to pass before merging`
- 가능하면 `CODEOWNERS` 추가

권장 CODEOWNERS 예시:

```text
/terraform/ @your-team/infra
/.github/workflows/ @your-team/platform
/controlplane/ @your-team/app
```

## 20. "별도 API 서버 없이" 가능한가

완전히 프론트만으로는 안 됩니다.

이유:

- GitHub App private key는 브라우저에 두면 안 됨
- LLM API key도 브라우저에 두면 안 됨
- commit, push, PR 생성은 서버 측 권한이 필요함

따라서 `서버 코드`는 무조건 있어야 합니다.

다만 별도 외부 SaaS API가 없어도 됩니다.

즉:

- 별도 FastAPI 제품이 없어도 됨
- 하지만 `controlplane/api` 같은 서버는 반드시 있어야 함

## 21. 팀 온보딩 절차

팀원 입장에서 가장 현실적인 온보딩 절차는 아래입니다.

### 프론트 전용 팀원

1. repo clone
2. `controlplane/web` 의존성 설치
3. `VITE_API_BASE_URL` 설정
4. 프론트 실행

### 백엔드 작업 팀원

1. repo clone
2. `controlplane/api` 의존성 설치
3. GitHub App secret 수령
4. LLM secret 수령
5. `.env` 설정
6. 백엔드 실행
7. 프론트 실행

### 팀 리드 또는 인프라 담당

1. GitHub App 생성
2. repo 설치
3. secret 관리
4. 팀 vault 접근 제어
5. 필요 시 webhook 실험 환경 관리

## 22. 지금 당장 필요한 운영 결정

팀에서 먼저 합의해야 할 것은 아래입니다.

1. GitHub App을 조직 기준으로 만들지
2. 어떤 팀원까지 secret을 받을지
3. polling으로 먼저 갈지
4. AI 수정 범위를 어디까지 허용할지
5. Terraform 수정은 항상 PR 승인으로 갈지

현재 상황에서는 아래를 추천합니다.

1. GitHub App은 조직 기준으로 생성
2. secret은 백엔드 담당자와 팀 리드만 우선 보유
3. 초기 MVP는 polling 방식
4. MVP에서는 Terraform과 workflow 오류만 우선 대응
5. 항상 branch -> PR -> 승인

## 23. 제가 바로 도와드릴 수 있는 작업

아래는 제가 이 저장소에서 바로 같이 할 수 있는 작업입니다.

- `controlplane/api` 초기 프로젝트 생성 `(제 도움을 받아보세요)`
- `controlplane/api/.env.example` 추가 `(제 도움을 받아보세요)`
- `controlplane/web/.env.example` 추가 `(제 도움을 받아보세요)`
- GitHub App 인증 코드 추가 `(제 도움을 받아보세요)`
- GitHub Actions runs/logs API 구현 `(제 도움을 받아보세요)`
- `GitActionsPage.tsx`를 mock -> real data 구조로 변경 `(제 도움을 받아보세요)`
- AI suggestion API 스키마 설계 `(제 도움을 받아보세요)`
- Confirm 후 branch/PR 생성 플로우 구현 `(제 도움을 받아보세요)`
- rerun/dispatch API 구현 `(제 도움을 받아보세요)`
- polling 기반 상태 갱신 구현 `(제 도움을 받아보세요)`
- 문서 보강 및 체크리스트 정리 `(제 도움을 받아보세요)`

## 24. 사용자가 직접 해야 하는 작업

아래는 제가 대신 할 수 없고 사용자가 직접 해야 하는 작업입니다.

- GitHub App 생성
- GitHub App 설치
- GitHub App 권한 승인
- 배포 환경 secret 주입
- 실제 운영 도메인 연결
- GitHub branch protection 설정
- CODEOWNERS 적용
- 팀 secret 관리 방식 결정

## 25. 다음 액션

이 문서를 기준으로 다음 단계는 아래 둘 중 하나입니다.

- GitHub App을 먼저 생성
- 바로 `controlplane/api` 구현을 시작

권장 순서는 아래입니다.

1. GitHub App 먼저 생성
2. 팀 vault에 dev secret 저장 방식 결정
3. `controlplane/api` 초기 서버 생성 `(제 도움을 받아보세요)`
4. polling 기반 `GitActionsPage.tsx` 실데이터 연결 준비 `(제 도움을 받아보세요)`
