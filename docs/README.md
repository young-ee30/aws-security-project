# GitHub App Integration Guide

이 문서는 이 저장소의 대시보드에서 GitHub Actions 실행, 실패 로그 조회, LLM 수정 제안, 사용자 승인 후 코드 수정, PR 생성, 재실행까지 연결하는 기준 가이드입니다.

기준 원칙은 다음과 같습니다.

- Git 연결은 `Personal Access Token` 대신 `GitHub App`으로 한다.
- 대시보드 프론트엔드는 GitHub를 직접 호출하지 않는다.
- 모든 GitHub 제어는 서버 측 `controlplane/api`가 `GitHub App installation token`으로 수행한다.
- AI가 만든 수정은 `main`에 바로 push하지 않고 `branch -> PR -> 승인 -> merge` 흐름으로 간다.
- Terraform과 workflow 파일은 특히 보호한다.

## 1. 왜 GitHub App인가

팀 프로젝트와 기업 대상 서비스라면 GitHub App이 가장 안전하고 운영하기 쉽습니다.

- 특정 개인 계정에 종속되지 않는다.
- 설치된 저장소에만 접근할 수 있다.
- 권한을 세분화할 수 있다.
- 토큰이 짧게 살아서 장기 노출 위험이 낮다.
- 조직 단위 설치와 고객사 온보딩이 쉽다.

이 프로젝트의 목표가 "대시보드에서 GitHub Actions를 보고, 실패 시 AI가 수정 제안하고, 사용자가 승인하면 실제 수정과 재실행까지 진행"인 만큼 GitHub App이 가장 잘 맞습니다.

## 2. 목표 아키텍처

구성은 아래처럼 잡습니다.

```text
Browser Dashboard
  -> controlplane/web
  -> controlplane/api
       -> GitHub App authentication
       -> GitHub REST API
       -> LLM API
       -> worker / job queue
  -> GitHub repository
  -> GitHub Actions
```

역할은 아래와 같습니다.

- `controlplane/web`: 실행 버튼, 로그, AI 제안, diff, 승인 UI
- `controlplane/api`: GitHub API 호출, webhook 수신, LLM 호출, 승인 처리
- `worker`: repo clone, 브랜치 생성, 코드 수정, 검증, push, PR 생성

## 3. GitHub App 생성

GitHub 조직 기준으로 아래 경로로 이동합니다.

`Organization Settings -> Developer settings -> GitHub Apps -> New GitHub App`

다음 값으로 생성합니다.

- `GitHub App name`: `devsecops-dashboard-bot`
- `Homepage URL`: `https://dashboard.your-domain.com`
- `Setup URL`: `https://dashboard.your-domain.com/settings/github/installed`
- `Webhook`: `Active`
- `Webhook URL`: `https://api.your-domain.com/api/github/webhook`
- `Webhook secret`: 랜덤 32자 이상
- `Where can this GitHub App be installed?`
  개발 단계: `Only on this account`
  외부 고객 설치까지 고려: `Any account`

초기 버전에서는 OAuth callback은 필수가 아닙니다. 서버가 설치 토큰으로만 동작해도 충분합니다.

## 4. GitHub App 권한

다음 권한으로 시작하는 것을 권장합니다.

```text
Repository permissions
- Actions: Read & write
- Contents: Read & write
- Pull requests: Read & write
- Metadata: Read-only
- Workflows: Read & write
- Checks: Read-only
- Commit statuses: Read-only
```

설명:

- `Actions`: workflow run 조회, 재실행, `workflow_dispatch`
- `Contents`: 브랜치 생성, 파일 수정, commit, push
- `Pull requests`: AI 수정 후 PR 생성
- `Workflows`: `.github/workflows/**` 수정이 필요할 때 사용

`Workflows` 권한은 실제로 workflow 파일을 AI가 고칠 가능성이 있으면 유지하고, 아니라면 나중에 빼도 됩니다.

## 5. Webhook 이벤트

아래 이벤트를 켭니다.

```text
- workflow_run
- workflow_job
- pull_request
- installation
- installation_repositories
```

용도:

- `workflow_run`: 성공/실패/재실행 상태 추적
- `workflow_job`: 어떤 step이 실패했는지 추적
- `pull_request`: AI가 만든 PR 상태 추적
- `installation`: 앱 설치 감지
- `installation_repositories`: 설치 저장소 변경 감지

## 6. App 설치

GitHub App 생성 후 `Install App`으로 이동해서 조직에 설치합니다.

권장 방식:

- `Only select repositories`
- 실제 사용할 저장소만 선택

이 프로젝트만 대상으로 하면 이 저장소만 선택합니다.

## 7. 저장해야 할 비밀값

GitHub App 생성 후 아래 값을 저장합니다.

- `App ID`
- `Client ID`
- `Private Key (.pem)`
- `Webhook Secret`

백엔드 환경 변수 예시는 아래와 같습니다.

```env
GITHUB_APP_ID=1234567
GITHUB_APP_CLIENT_ID=Iv1.xxxxx
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=replace-this
GITHUB_OWNER=your-org
GITHUB_REPO=aws-security-project
```

운영 환경에서는 `.env` 대신 Secret Manager 또는 ECS task secret으로 주입하는 것을 권장합니다.

## 8. 대시보드 백엔드에서 해야 할 일

현재 이 저장소의 `controlplane/api`는 비어 있으므로, GitHub App 연동 백엔드를 이 위치에 구현하면 됩니다.

핵심 책임은 아래와 같습니다.

- 저장소 설치 정보 조회
- installation token 발급
- workflow runs 조회
- 실패 logs 조회
- rerun API 호출
- workflow dispatch 호출
- AI 수정 승인 후 branch 생성, commit, push, PR 생성
- webhook 수신 및 검증

## 9. 추천 API 엔드포인트

최소 엔드포인트는 아래 정도면 충분합니다.

```text
GET    /api/github/runs
GET    /api/github/runs/:runId/jobs
GET    /api/github/runs/:runId/logs
POST   /api/github/runs/:runId/rerun-failed
POST   /api/github/workflows/:workflowId/dispatch
POST   /api/github/fix-sessions/:runId/suggest
POST   /api/github/fix-sessions/:runId/confirm
POST   /api/github/webhook
```

역할은 아래와 같습니다.

- `runs`: 최근 workflow 실행 목록
- `jobs/logs`: 실패 step과 로그 조회
- `rerun-failed`: 실패 job 재실행
- `dispatch`: 수동 workflow 실행
- `suggest`: LLM 수정안 생성
- `confirm`: 사용자 승인 후 실제 코드 변경
- `webhook`: GitHub 이벤트 수신

## 10. Node 기준 GitHub App 연결 예시

패키지 설치:

```bash
npm install octokit express dotenv
```

예시 코드:

```ts
import { App } from "octokit";

export const ghApp = new App({
  appId: Number(process.env.GITHUB_APP_ID),
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
  webhooks: {
    secret: process.env.GITHUB_WEBHOOK_SECRET!,
  },
});

export async function getInstallationId(owner: string, repo: string) {
  const { data } = await ghApp.octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo }
  );
  return data.id;
}

export async function getRepoOctokit(owner: string, repo: string) {
  const installationId = await getInstallationId(owner, repo);
  return ghApp.getInstallationOctokit(installationId);
}
```

이렇게 얻은 `octokit`으로 아래 작업을 수행합니다.

- workflow run 조회
- rerun failed jobs
- workflow dispatch
- branch/commit/push
- pull request 생성

## 11. Actions 실행 및 재실행 예시

실패한 workflow 재실행:

```ts
await gh.request(
  "POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs",
  {
    owner,
    repo,
    run_id: Number(runId),
  }
);
```

수동 workflow 실행:

```ts
await gh.request(
  "POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches",
  {
    owner,
    repo,
    workflow_id: "terraform-dev-plan-apply.yml",
    ref: "main",
  }
);
```

이 저장소에는 이미 수동 실행 가능한 workflow가 있습니다.

- `.github/workflows/terraform-dev-plan-apply.yml`
- `.github/workflows/ex-ecs-deploy.yml`

## 12. AI 수정 확정 후 실제 코드 반영 플로우

권장 흐름은 아래와 같습니다.

1. 사용자가 대시보드에서 실패한 run 선택
2. 서버가 해당 run의 실패 로그 수집
3. LLM이 수정안과 예상 변경 파일, 위험도, diff 초안 제안
4. 사용자가 `Confirm`
5. worker가 새 브랜치 생성
6. worker가 코드 수정
7. worker가 최소 검증 수행
8. worker가 branch push
9. 서버가 PR 생성
10. 리뷰/승인 후 merge
11. 필요하면 workflow 재실행 또는 dispatch

권장 브랜치 이름:

```text
ai-fix/run-123456789
```

권장 커밋 메시지:

```text
ai fix: workflow run 123456789
```

## 13. worker에서 git 처리 예시

설치 토큰으로 clone/push 하는 예시는 아래와 같습니다.

```bash
git clone https://x-access-token:${TOKEN}@github.com/OWNER/REPO.git work
cd work
git checkout -b ai-fix/run-123456789

# 여기서 AI가 파일 수정

git add .
git commit -m "ai fix: workflow run 123456789"
git push origin HEAD
```

그 후 PR 생성:

```ts
await gh.request("POST /repos/{owner}/{repo}/pulls", {
  owner,
  repo,
  title: "AI fix for failed workflow run 123456789",
  head: "ai-fix/run-123456789",
  base: "main",
  body: "Generated from dashboard after user confirmation.",
});
```

## 14. Terraform 수정 시 주의사항

이 프로젝트에서는 AI가 Terraform을 고칠 수 있습니다. 다만 다음 제한을 강하게 권장합니다.

- `terraform/**` 변경은 항상 PR 기반으로만 진행
- `main` 직접 push 금지
- 최소 검증 필수

검증 순서는 보통 아래와 같습니다.

```bash
terraform fmt -check -recursive ../../
terraform init -backend-config=backend.hcl
terraform validate -no-color
terraform plan -lock-timeout=10m -no-color -out=tfplan
```

AI가 Terraform을 고치는 경우에도 사용자가 대시보드에서 diff를 보고 승인해야 합니다.

## 15. GitHub 보호 규칙 권장 설정

기업 대상이라면 아래는 거의 필수입니다.

- `main` 보호 브랜치
- `Require a pull request before merging`
- `Require status checks to pass before merging`
- `Require approval from code owners`
- force push 금지

추가로 `CODEOWNERS`를 권장합니다.

예시:

```text
/terraform/ @your-org/infra-team
/.github/workflows/ @your-org/platform-team
/controlplane/ @your-org/app-team
```

이렇게 하면 Terraform이나 workflow 파일을 AI가 수정해도 지정된 팀 승인 없이는 병합되지 않습니다.

## 16. 대시보드 구현 시 금지 사항

아래는 피해야 합니다.

- 브라우저에서 GitHub PAT 직접 사용
- 대시보드 프론트엔드에서 GitHub REST API 직접 호출
- AI가 `main`에 직접 push
- 사용자 승인 없이 Terraform apply 실행
- 장기 AWS access key를 GitHub Actions secret에 고정 저장

## 17. AWS 배포 자격 증명 권장 방식

GitHub Actions에서 AWS 접근은 장기 키 대신 OIDC를 권장합니다.

즉:

- GitHub App은 GitHub 제어 전용
- AWS 권한은 GitHub Actions OIDC 전용

역할을 분리해야 운영과 보안이 단순해집니다.

## 18. 이 저장소 기준 추천 구현 순서

이 저장소에서 바로 시작할 순서는 아래가 적절합니다.

1. `controlplane/api`에 GitHub App 인증 및 webhook 수신 추가
2. `controlplane/web`의 Git Actions 화면을 실데이터 기반으로 교체
3. 실패 run 로그 수집 API 추가
4. LLM 수정 제안 API 추가
5. 승인 후 branch/PR 생성 worker 추가
6. rerun / dispatch 연결
7. Terraform 전용 검증 단계 추가

## 19. 체크리스트

실행 전 체크리스트:

- [ ] GitHub App 생성 완료
- [ ] 조직 또는 계정에 App 설치 완료
- [ ] 저장소 선택 설치 완료
- [ ] private key 저장 완료
- [ ] webhook secret 저장 완료
- [ ] `controlplane/api`에 환경 변수 주입 완료
- [ ] webhook endpoint 공개 완료
- [ ] branch protection 설정 완료
- [ ] CODEOWNERS 설정 완료
- [ ] 대시보드에서 workflow runs 조회 확인
- [ ] rerun/dispatch 동작 확인
- [ ] AI 수정 후 branch/PR 생성 확인

## 20. 공식 문서

- GitHub App 생성: <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app>
- GitHub App 권한: <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app>
- GitHub App 설치: <https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app>
- App 인증: <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app>
- Installation token 발급: <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app>
- workflow dispatch API: <https://docs.github.com/en/rest/actions/workflows>
- workflow run 재실행 API: <https://docs.github.com/en/rest/actions/workflow-runs>
- Webhook 서명 검증: <https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries>
- Protected branches: <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>
- CODEOWNERS: <https://docs.github.com/ko/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners>
