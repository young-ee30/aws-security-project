# Git Actions Page Technical Guide

## 개요

이 문서는 `/git-actions` 페이지를 구성하는 파일들이 어떻게 유기적으로 연결되는지 설명하는 기술 문서다.

이 페이지는 단순 로그 뷰어가 아니다. 실제로는 아래 기능이 한 화면에 묶여 있다.

- GitHub App 연결 상태 확인
- 최근 GitHub Actions run 목록 조회
- 선택한 run의 jobs, steps, logs, annotations, summary 표시
- 전체 파이프라인 실행
- 현재 run 재실행 / 실패 job만 재실행
- 실패 원인 AI 제안
- AI 수정안을 PR로 생성
- 생성된 PR 조회, merge, close

이 페이지를 이해할 때 가장 중요한 관점은 다음이다.

> `GitActionsPage.tsx`가 화면의 오케스트레이터이고, `routes/*.ts`는 HTTP 진입점이며, `github/*.ts`와 `fix/*.ts`가 실제 기능을 수행하는 서비스 레이어다.

즉, 핵심은 개별 파일 하나가 아니라 "프론트 컨트롤러 -> Express 라우터 -> GitHub/AI 서비스 모듈 -> GitHub API"의 연결 구조다.

## 이 페이지에 필요한 파일 트리

아래 트리는 저장소 전체가 아니라, Git Actions 페이지를 설명할 때 직접 필요한 파일만 추린 것이다.

```text
aws-security-project/
├─ controlplane/
│  ├─ web/
│  │  └─ src/
│  │     ├─ App.tsx                                      # /git-actions 라우트를 등록한다.
│  │     ├─ pages/
│  │     │  └─ GitActionsPage.tsx                        # 이 페이지의 메인 컨트롤러. 데이터 로드, 버튼 액션, 상태 관리가 모두 모인다.
│  │     └─ components/
│  │        └─ pipeline/
│  │           ├─ PipelineGraph.tsx                      # workflow/job 구조를 운영 화면용 그래프로 재구성한다.
│  │           └─ StepTimeline.tsx                       # step 상태, 요약, 선택 UI를 담당한다.
│  └─ api/
│     └─ src/
│        ├─ server.ts                                    # Express 서버 시작점. githubRouter, fixRouter를 연결한다.
│        ├─ routes/
│        │  ├─ github.ts                                 # run 조회, logs 조회, rerun, dispatch, PR 조회/merge/close API를 제공한다.
│        │  └─ fix.ts                                    # AI 제안 생성과 PR 생성 confirm API를 제공한다.
│        ├─ github/
│        │  ├─ app.ts                                    # GitHub App 인증과 installation token 발급을 담당한다.
│        │  ├─ actions.ts                                # GitHub Actions REST API, PR API 호출을 실제로 수행한다.
│        │  └─ changes.ts                                # Git Data API로 branch, tree, commit, PR을 만든다.
│        ├─ fix/
│        │  ├─ summarize.ts                              # run/job/step을 사람이 읽기 쉬운 요약으로 바꾼다.
│        │  └─ suggest.ts                                # 로그를 규칙 기반으로 분석하고, 필요 시 AI 제안을 붙인다.
│        └─ llm/
│           └─ client.ts                                 # Gemini 호출 공통 어댑터
├─ .github/
│  ├─ workflows/
│  │  └─ ex-ecs-deploy.yml                               # 배포 workflow. 어떤 서비스를 배포할지 결정한다.
│  └─ actions/
│     └─ deploy-ecs-service/
│        └─ action.yml                                   # ECS 배포 공통 단계를 실제로 수행하는 composite action
└─ docs/
   └─ git_actions_with_app/
      └─ git-actions-page-technical-guide.md             # 현재 문서
```

## 기술 스택

| 기술 | 왜 쓰는가 | 실제 구현 위치 |
| --- | --- | --- |
| React + TypeScript + Vite | 상태가 많은 운영 대시보드 UI를 만들기 위해 | `controlplane/web/src/pages/GitActionsPage.tsx` |
| React Router | `/git-actions` 라우트를 연결하기 위해 | `controlplane/web/src/App.tsx` |
| Express + TypeScript | 브라우저와 GitHub/AI 사이의 중간 API 서버를 만들기 위해 | `controlplane/api/src/server.ts` |
| GitHub App + Octokit | 브라우저에 토큰을 노출하지 않고 GitHub를 제어하기 위해 | `controlplane/api/src/github/app.ts` |
| GitHub Actions REST API | runs, jobs, logs, rerun, dispatch를 다루기 위해 | `controlplane/api/src/github/actions.ts` |
| Git Data API | 로컬 git clone 없이 branch, commit, PR을 만들기 위해 | `controlplane/api/src/github/changes.ts` |
| Rule-based analyzer | 실패 유형을 빠르게 분류하고 후보 파일을 찾기 위해 | `controlplane/api/src/fix/suggest.ts` |
| Gemini API | 로그 원인 설명과 수정안 생성을 보조하기 위해 | `controlplane/api/src/llm/client.ts` |
| Polling | webhook 없이 run 상태를 주기적으로 갱신하기 위해 | `controlplane/web/src/pages/GitActionsPage.tsx` |
| Composite GitHub Action | ECS 배포 공통 단계를 workflow 밖으로 분리하기 위해 | `.github/actions/deploy-ecs-service/action.yml` |

## 전체 연결 구조

이 페이지는 아래 4개 층이 연결되어 동작한다.

```text
1. 라우팅 층
   App.tsx
   -> /git-actions

2. 프론트 컨트롤러 층
   GitActionsPage.tsx
   -> 상태 관리
   -> API 호출
   -> PipelineGraph / StepTimeline 렌더링

3. 백엔드 진입 층
   server.ts
   -> routes/github.ts
   -> routes/fix.ts

4. 서비스 층
   github/app.ts
   -> GitHub App 인증
   github/actions.ts
   -> run/jobs/logs/dispatch/rerun/PR 조회
   github/changes.ts
   -> branch/commit/PR 생성
   fix/summarize.ts
   -> run 요약 생성
   fix/suggest.ts
   -> 로그 분석 + AI 제안
   llm/client.ts
   -> Gemini 호출
```

즉, 페이지 기능은 다음처럼 완성된다.

```text
사용자 버튼 클릭
  -> GitActionsPage.tsx
  -> /api/github/* 또는 /api/github/fix-sessions/*
  -> routes/github.ts 또는 routes/fix.ts
  -> github/actions.ts / fix/suggest.ts / github/changes.ts
  -> github/app.ts 로 인증된 Octokit 사용
  -> GitHub API 또는 Gemini API 호출
  -> 결과를 다시 GitActionsPage.tsx가 받아서 화면에 반영
```

## 기능 기준으로 파일 연결 보기

이 표가 가장 실무적으로 중요하다. 각 기능이 어떤 파일들을 거쳐 완성되는지 한 번에 보여준다.

| 사용자 기능 | 프론트 시작점 | API 진입점 | 실제 처리 파일 | 결과 |
| --- | --- | --- | --- | --- |
| run 목록 표시 | `GitActionsPage.tsx`의 `fetchRuns()` | `GET /api/github/runs` | `routes/github.ts` -> `github/actions.ts`의 `listWorkflowRuns()` | 최근 workflow run 목록 표시 |
| run 상세 표시 | `loadRunDetail()` | `GET /api/github/runs/:runId/jobs` | `routes/github.ts` -> `github/actions.ts`의 `getWorkflowRunJobs()` | job/step 목록 표시 |
| run 요약 표시 | `loadRunSummary()` | `GET /api/github/runs/:runId/summary` | `routes/github.ts` -> `fix/summarize.ts`의 `generateRunSummary()` | 사람 친화적 요약 표시 |
| 로그 표시 | `loadRunLogs()` | `GET /api/github/runs/:runId/logs` | `routes/github.ts` -> `github/actions.ts`의 `getWorkflowRunLogs()` | 실패 job 또는 선택 job 로그 표시 |
| annotation 표시 | `loadRunAnnotations()` | `GET /api/github/runs/:runId/annotations` | `routes/github.ts` -> `github/actions.ts`의 `getWorkflowRunAnnotations()` | Checkov/GitHub annotation 표시 |
| 전체 파이프라인 실행 | `handleExecuteworkflow()` | `POST /api/github/pipeline/run-all` | `routes/github.ts` -> `github/actions.ts`의 `dispatchFullPipeline()` | Bootstrap workflow부터 새 run 시작 |
| rerun / rerun failed | `handleRerun()` | `POST /api/github/runs/:runId/rerun*` | `routes/github.ts` -> `github/actions.ts`의 `rerunWorkflowRun()` / `rerunFailedJobs()` | 기존 run 재실행 |
| AI 제안 | `handleSuggest*()` | `POST /api/github/fix-sessions/:runId/suggest` | `routes/fix.ts` -> `fix/suggest.ts` -> `llm/client.ts` | 원인 요약, 후보 파일, 수정안 생성 |
| PR 생성 | `handleApply()` | `POST /api/github/fix-sessions/:runId/confirm` | `routes/fix.ts` -> `github/changes.ts`의 `createPullRequestFromFiles()` | 새 branch, commit, PR 생성 |
| PR merge / close | `handleMergePr()`, `handleClosePr()` | `POST /merge`, `PATCH /close` | `routes/github.ts` -> `github/actions.ts` | PR 상태 변경 |

## 자세한 설명

### 1. 진입점: `App.tsx`

이 파일은 단순하지만 중요하다. Git Actions 페이지가 애플리케이션 안에서 어느 경로로 진입하는지 결정한다.

```tsx
<Route path="git-actions" element={<GitActionsPage />} />
```

역할은 하나다.

- `/git-actions` URL과 `GitActionsPage.tsx`를 연결한다.

즉, 이 파일은 기능을 수행하지는 않지만, 페이지가 앱 안에 들어오는 시작점이다.

### 2. 프론트의 중심: `GitActionsPage.tsx`

이 파일이 사실상 화면의 오케스트레이터다. 페이지 기능의 대부분이 여기서 시작된다.

이 파일이 맡는 역할은 다음과 같다.

- API 호출 공통 함수 제공
- run 목록, 선택된 run, jobs, logs, annotations, summary 상태 관리
- polling 처리
- workflow 실행, rerun, AI 제안, PR 생성 버튼 핸들러 처리
- `PipelineGraph.tsx`, `StepTimeline.tsx`에 가공된 데이터를 넘김

#### 핵심 코드 1: 공통 API 진입점

```ts
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : undefined),
      ...(init?.headers || {}),
    },
  })
  ...
}
```

이 함수가 중요한 이유는, 페이지의 거의 모든 기능이 결국 이 함수로 서버에 들어가기 때문이다.

- run 조회
- logs 조회
- rerun
- dispatch
- AI 제안
- PR 생성

즉, 프론트와 백엔드를 잇는 단일 관문이다.

#### 핵심 코드 2: run 선택 시 상세 데이터를 한 번에 로드

```ts
useEffect(() => {
  if (!selectedRunId) {
    ...
    return
  }

  void loadRunDetail(selectedRunId)
  void loadRunSummary(selectedRunId)
  void loadRunLogs(selectedRunId)
  void loadRunAnnotations(selectedRunId)

  const intervalId = window.setInterval(() => {
    void loadRunDetail(selectedRunId, true)
    void loadRunSummary(selectedRunId)
    void loadRunAnnotations(selectedRunId)
  }, POLLING_INTERVAL_MS)

  return () => window.clearInterval(intervalId)
}, [selectedRunId])
```

이 코드가 보여주는 구조는 명확하다.

- 사용자가 run을 고른다.
- 프론트가 jobs, summary, logs, annotations를 각각 다른 API로 병렬 조회한다.
- 그 결과가 화면 카드와 컴포넌트로 분산 렌더링된다.

즉, `GitActionsPage.tsx`는 데이터를 직접 계산하지 않고 여러 백엔드 모듈의 결과를 모아 조합한다.

#### 핵심 코드 3: 전체 파이프라인 실행

```ts
await apiFetch('/api/github/pipeline/run-all', {
  method: 'POST',
  body: JSON.stringify({ ref: targetBranch }),
})
```

이 버튼 하나가 실제로는 다음 흐름을 시작한다.

`GitActionsPage.tsx` -> `routes/github.ts` -> `github/actions.ts` -> GitHub `workflow_dispatch`

즉, 화면 버튼이 workflow를 직접 실행하는 것이 아니라, 백엔드가 GitHub App 권한으로 대신 실행한다.

#### 핵심 코드 4: AI 제안

```ts
const payload = await apiFetch(`/api/github/fix-sessions/${selectedRunId}/suggest`, {
  method: 'POST',
  body: JSON.stringify({}),
})
setSuggestion(payload)
```

이 코드는 AI 기능의 프론트 시작점이다. 하지만 실제 분석은 여기서 하지 않는다. 이 파일은 "어떤 run을 어떤 방식으로 분석할지"를 백엔드에 전달하고, 받은 결과를 UI에 렌더링한다.

#### 핵심 코드 5: PR 생성

```ts
const result = await apiFetch(`/api/github/fix-sessions/${selectedRunId}/confirm`, {
  method: 'POST',
  body: JSON.stringify({
    files: suggestion.suggestedFiles,
    commitMessage: `ai fix: Terraform 수정 제안 (run #${selectedRunId})`,
  }),
})
```

즉, PR 생성도 프론트가 git 작업을 하는 것이 아니라, 수정 파일 목록만 넘기고 실제 branch/commit/PR 생성은 백엔드에 위임한다.

### 3. 화면 표시 전용 컴포넌트: `PipelineGraph.tsx`, `StepTimeline.tsx`

이 두 파일은 API를 직접 호출하지 않는다. `GitActionsPage.tsx`가 모아 놓은 데이터를 "운영자가 이해하기 쉬운 UI"로 바꾸는 역할이다.

#### `PipelineGraph.tsx`

이 파일은 raw job 목록을 그대로 그리지 않는다. workflow 이름에 따라 job 구조를 재조립한다.

핵심 코드:

```ts
if (/terraform dev plan and apply/i.test(workflowName)) {
  return [
    {
      jobs: [findJob(jobs, /terraform plan & security scan/i) || createPlaceholderJob('terraform-plan', 'Terraform Plan & Security Scan')],
    },
    {
      jobs: [findJob(jobs, /^terraform apply$/i) || createPlaceholderJob('terraform-apply', 'Terraform Apply')],
    },
  ]
}
```

이 코드의 의미는 다음과 같다.

- GitHub job 이름은 그대로 쓰기엔 들쑥날쑥하다.
- 운영 화면은 "Plan", "Apply", "Deploy" 같은 단계 중심으로 보여주는 편이 이해하기 쉽다.
- 실제 job이 아직 생성되지 않았어도 placeholder를 만들어 파이프라인 형태를 유지한다.

즉, `PipelineGraph.tsx`는 "GitHub의 원본 데이터"를 "운영자가 읽기 쉬운 파이프라인 구조"로 번역하는 컴포넌트다.

#### `StepTimeline.tsx`

이 파일은 선택된 job의 step들을 상태 카드로 그린다.

핵심 코드:

```tsx
{steps.map((step, index) => {
  const active = activeStepNumber === step.number
  const expandedContent = active ? renderExpandedContent?.(step) : null
  ...
})}
```

즉, 이 컴포넌트는 단순한 목록이 아니라:

- 어떤 step이 현재 선택되었는지
- 어떤 step이 실패했는지
- 어떤 step의 확장 로그를 아래에 열지

를 UI 레벨에서 담당한다.

### 4. Express 시작점: `server.ts`

`server.ts`는 기능을 직접 수행하지는 않지만, 백엔드 구조를 결정하는 진입점이다.

핵심 코드:

```ts
app.use(githubRouter)
app.use(fixRouter)
```

의미는 단순하다.

- GitHub 조회/제어 계열 기능은 `githubRouter`
- AI 제안과 PR 생성은 `fixRouter`

로 분리되어 있다.

이 분리가 중요한 이유는, 페이지 기능이 커져도 HTTP 진입점과 실제 서비스 로직을 섞지 않게 해 주기 때문이다.

### 5. HTTP 계약 층: `routes/github.ts`

이 파일은 브라우저가 호출하는 API 명세를 담당한다. 이 파일 자체는 로직을 길게 갖지 않고, 대부분의 요청을 서비스 함수로 넘긴다.

핵심 코드:

```ts
githubRouter.get('/api/github/runs/:runId/logs', async (req, res, next) => {
  const logs = await getWorkflowRunLogs(runId, jobId)
  res.json(logs)
})
```

이 구조의 장점은 명확하다.

- 프론트엔드는 `/api/github/...`라는 일정한 URL만 알면 된다.
- 실제 GitHub 호출 방식이 바뀌어도 프론트는 안 바뀔 수 있다.
- route 파일은 request validation과 response formatting만 맡는다.

이 파일이 연결하는 대표 기능은 다음과 같다.

- `/status`
- `/runs`
- `/runs/:runId/jobs`
- `/runs/:runId/logs`
- `/runs/:runId/annotations`
- `/runs/:runId/summary`
- `/pipeline/run-all`
- `/runs/:runId/rerun`
- `/pulls/:prNumber`
- `/pulls/:prNumber/merge`
- `/pulls/:prNumber/close`

즉, `routes/github.ts`는 "브라우저가 부르는 GitHub 관련 API의 관문"이다.

### 6. AI/PR용 HTTP 계약 층: `routes/fix.ts`

이 파일은 GitHub Actions 페이지의 AI 기능과 PR 생성 기능을 위해 따로 존재한다.

핵심 코드:

```ts
fixRouter.post('/api/github/fix-sessions/:runId/suggest', async (req, res, next) => {
  const suggestion = await generateFixSuggestion(runId, { ... })
  res.json(suggestion)
})

fixRouter.post('/api/github/fix-sessions/:runId/confirm', async (req, res, next) => {
  const result = await createPullRequestFromFiles({ ... })
  res.json(result)
})
```

여기서 중요한 점은 역할 분리다.

- `suggest`는 분석과 제안 생성
- `confirm`은 실제 Git 변경과 PR 생성

즉, "생각하는 단계"와 "반영하는 단계"를 분리해 두었다.

### 7. GitHub 인증 층: `github/app.ts`

이 파일은 모든 GitHub API 호출의 출발점이다. `github/actions.ts`나 `github/changes.ts`는 직접 토큰을 만들지 않고, 이 파일을 통해 인증된 Octokit을 얻는다.

핵심 코드:

```ts
export async function getRepoOctokit() {
  const installation = await getInstallationForRepository()
  return githubApp.getInstallationOctokit(installation.id)
}
```

이 파일의 역할은 다음과 같다.

- private key 정규화
- GitHub App 인스턴스 초기화
- repository installation 조회
- installation token 기반 Octokit 생성

즉, 이 파일은 나머지 백엔드 모듈이 "안전하게 GitHub를 호출할 수 있게 해 주는 인증 공장"이다.

### 8. GitHub Actions 어댑터: `github/actions.ts`

이 파일은 GitHub API 호출을 실제로 수행하는 핵심 어댑터다. `routes/github.ts`가 이 파일에 거의 전적으로 의존한다.

이 파일의 역할은 크게 세 묶음이다.

- 조회
  run 목록, jobs, logs, annotations, PR 상세
- 제어
  rerun, rerun-failed, workflow dispatch
- 보조
  repository file content 조회

#### 핵심 코드 1: run 목록 조회

```ts
export async function listWorkflowRuns(limit = 20) {
  const octokit = await getRepoOctokit()
  const response = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    per_page: limit,
  })
  ...
}
```

즉, 프론트가 보는 run 목록은 결국 이 함수가 GitHub REST API에서 가져온 결과다.

#### 핵심 코드 2: 로그 다운로드

```ts
const redirectResponse = await fetch(
  `https://api.github.com/repos/${env.githubOwner}/${env.githubRepo}/actions/jobs/${jobId}/logs`,
  { method: 'GET', redirect: 'manual', headers: { Authorization: `Bearer ${token}` } },
)

if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
  const location = redirectResponse.headers.get('location')
  ...
  const downloadResponse = await fetch(location)
  return downloadResponse.text()
}
```

이 코드가 중요한 이유는 GitHub job logs API가 로그 본문을 바로 주지 않고 redirect URL을 줄 수 있기 때문이다. 따라서 `actions.ts`는 단순 REST 호출을 넘어서 "로그 다운로드 프로토콜"까지 감싸고 있다.

#### 핵심 코드 3: 어떤 로그를 보여줄지 선택

```ts
const selectedJobs = requestedJobId
  ? jobs.filter((job) => job.id === requestedJobId)
  : jobs.filter(
      (job) =>
        job.status === 'completed' &&
        formatConclusion(job.conclusion) !== 'success' &&
        formatConclusion(job.conclusion) !== 'skipped',
    )
```

이 코드의 의미는 다음과 같다.

- 사용자가 특정 job을 골랐다면 그 job 로그만 보여준다.
- 그렇지 않으면 실패한 job 로그를 우선으로 가져온다.
- 실패 로그가 없으면 진행 중 job이나 앞쪽 job을 보여준다.

즉, `actions.ts`는 단순히 "로그를 가져오는 모듈"이 아니라, 운영 화면에 어떤 로그가 가장 유용한지도 같이 결정한다.

#### 핵심 코드 4: 전체 파이프라인 실행

```ts
export async function dispatchFullPipeline(ref?: string) {
  const result = await dispatchWorkflow(FULL_PIPELINE_ENTRY_WORKFLOW, ref, FULL_PIPELINE_DEFAULT_INPUTS)
  return {
    ok: true,
    workflowId: result.workflowId,
    ref: result.ref,
    message: 'Requested full GitHub Actions pipeline from Bootstrap Terraform State',
  }
}
```

즉, 화면에서 "전체 실행" 버튼을 누르면 사실상 이 함수가 `bootstrap-terraform-state.yml` workflow_dispatch를 날리는 구조다.

### 9. 요약 생성 모듈: `fix/summarize.ts`

이 파일은 LLM을 쓰지 않고, job과 step 정보를 사람이 읽기 쉬운 문장으로 바꾼다.

핵심 코드:

```ts
export async function generateRunSummary(runId: number): Promise<RunSummaryResponse> {
  const jobs = await getWorkflowRunJobs(runId)
  ...
  return {
    runId,
    jobs: jobSummaries,
    overallSummary: buildOverallSummary(jobs),
    currentPhase: determineCurrentPhase(jobs),
  }
}
```

이 모듈이 필요한 이유는, 운영자는 raw GitHub step 이름만 보는 것보다 "현재 Terraform Apply 중", "Checkov 단계 실패" 같은 요약을 보는 편이 훨씬 빠르게 상황을 이해할 수 있기 때문이다.

즉, `summarize.ts`는 GitHub 원본 데이터를 운영자 친화적 문장으로 바꾸는 번역기다.

### 10. AI 분석 엔진: `fix/suggest.ts`

이 파일은 Git Actions 페이지의 AI 기능 핵심이다. 하지만 이 파일은 LLM만 호출하지 않는다. 먼저 로그를 분석하고, 후보 파일을 찾고, 필요한 Terraform 코드까지 가져온 뒤, 마지막에 LLM에게 보강 분석을 요청한다.

이 파일의 내부 흐름은 다음과 같다.

```text
runId 입력
  -> jobs 조회
  -> logs 조회
  -> annotation 정규화
  -> rule-based 실패 유형 분류
  -> candidateFiles 추출
  -> 관련 Terraform 파일 내용 조회
  -> LLM 분석 요청
  -> llmAnalysis + suggestedFiles 반환
```

#### 핵심 코드 1: GitHub 데이터 수집

```ts
const [jobsResult, logsResult] = await Promise.allSettled([
  getWorkflowRunJobs(parsedRunId),
  selectedStepLog ? Promise.resolve(fallbackLogsResponse) : getWorkflowRunLogs(parsedRunId, options?.jobId),
])
```

즉, 이 모듈은 혼자 판단하지 않고, 먼저 `github/actions.ts`의 결과를 가져다 쓴다.

#### 핵심 코드 2: 후보 Terraform 코드까지 읽어 온다

```ts
async function fetchTerraformContext(candidateFiles: CandidateFile[]): Promise<string> {
  const tfFiles = candidateFiles
    .filter((f) => f.path.endsWith('.tf') || f.path.endsWith('.tfvars'))
    .slice(0, 3)

  const contents = await Promise.all(
    tfFiles.map(async (f) => {
      const content = await getFileContent(f.path)
      ...
    }),
  )
}
```

이 부분이 중요한 이유는, AI가 로그만 보고 막연히 답하지 않게 하기 위해서다. 실제 관련 Terraform 코드 일부를 같이 보내야 더 현실적인 수정안을 만들 수 있다.

즉, `suggest.ts`는 `actions.ts`의 `getFileContent()`와도 연결되어 있다.

#### 핵심 코드 3: 최종 AI 제안 생성

```ts
const llmResult = await callLlmAnalysis(joinedLogText, ruleMessage, annotationSummaryText, stepContext, terraformContext)
llmAnalysis = llmResult.analysis || undefined
suggestedFiles = llmResult.suggestedFiles.length > 0 ? llmResult.suggestedFiles : undefined
```

이 단계에서 반환되는 값이 실제로 프론트에 보이는 핵심 결과다.

- 원인 요약
- 위험도
- 다음 조치
- 후보 파일
- 수정된 파일 내용 제안

즉, 이 파일은 "GitHub 데이터"를 "수정 제안"으로 바꾸는 중심 모듈이다.

### 11. LLM 전송 레이어: `llm/client.ts`

이 파일은 AI 분석의 중심 로직이 아니라, `suggest.ts`가 준비한 프롬프트를 Gemini API로 보내는 전송 계층이다.

핵심 코드:

```ts
export async function callConfiguredLlm(input: LlmRequest): Promise<LlmResponse | null> {
  if (!env.llmApiKey) {
    return null
  }

  return callGemini(input)
}
```

즉, `client.ts`는 "무엇을 분석할지"를 결정하지 않고 "준비된 입력을 어떻게 Gemini에 보낼지"만 담당한다.

이 파일이 분리되어 있는 이유는 다음과 같다.

- `suggest.ts`의 비즈니스 로직과 LLM 통신 로직을 분리하기 위해
- provider 교체 가능성을 남기기 위해
- API 키를 프론트에 노출하지 않기 위해

### 12. PR 생성 엔진: `github/changes.ts`

이 파일은 Git Actions 페이지의 "Apply" 버튼 뒤에서 실제 Git 변경을 만든다. 중요한 점은 로컬에서 `git clone`을 하지 않는다는 것이다. 대신 GitHub Git Data API를 직접 사용한다.

핵심 코드:

```ts
const { branchName, baseCommitSha } = await reserveBranchName(baseBranch, input.branchName || `ai-fix/run-${input.runId}`)
const tree = await buildTreeEntries(input.files)
const newTree = await octokit.request('POST /repos/{owner}/{repo}/git/trees', { ... })
const commit = await octokit.request('POST /repos/{owner}/{repo}/git/commits', { ... })
await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', { ... })
const pullRequest = await octokit.request('POST /repos/{owner}/{repo}/pulls', { ... })
```

이 코드가 보여주는 구조는 다음과 같다.

1. base branch 기준 새 branch 생성
2. AI가 제안한 파일들을 blob/tree로 변환
3. commit 생성
4. branch ref 업데이트
5. PR 생성

즉, `changes.ts`는 "AI가 만든 수정안"을 "실제 GitHub PR"로 바꾸는 마지막 엔진이다.

### 13. 배포 workflow와의 연결: `.github/workflows/ex-ecs-deploy.yml`

Git Actions 페이지는 이 workflow를 직접 수정하지는 않지만, run 목록과 job/step 화면에서 이 workflow를 주요 파이프라인 일부로 보여준다.

이 workflow가 중요한 이유는:

- Git Actions 페이지가 모니터링하는 대표 workflow 3개 중 하나이기 때문이다.
- `PipelineGraph.tsx`가 deploy workflow를 별도 모양으로 그리기 때문이다.
- 전체 파이프라인 설명에서 배포 단계가 실제 어디서 수행되는지 보여 주기 때문이다.

핵심 코드:

```yaml
jobs:
  resolve-targets:
    name: Resolve Deployment Targets
  deploy-selected:
    strategy:
      matrix: ${{ fromJson(needs.resolve-targets.outputs.matrix) }}
```

즉, 이 workflow는:

- 먼저 어떤 서비스를 배포할지 결정하고
- 그 결과를 matrix로 만들고
- 서비스별 배포 job을 병렬 실행한다.

### 14. 실제 ECS 배포 엔진: `.github/actions/deploy-ecs-service/action.yml`

이 파일은 페이지를 구성하는 UI 파일은 아니지만, deploy workflow가 실제로 어떤 일을 하는지 설명할 때 반드시 필요하다.

핵심 코드:

```yaml
- name: Build and tag Docker image
  run: |
    docker build ...

- name: Push image to Amazon ECR
  run: |
    docker push ...

- name: Deploy Amazon ECS task definition
  uses: aws-actions/amazon-ecs-deploy-task-definition@v2
```

이 action의 역할은 다음과 같다.

- AWS 자격 증명 설정
- ECR 로그인
- Docker 이미지 build / push
- Trivy 스캔
- ECS task definition 갱신
- ECS 서비스 배포

즉, `.github/workflows/ex-ecs-deploy.yml`이 "배포 대상을 결정하는 오케스트레이터"라면, `.github/actions/deploy-ecs-service/action.yml`은 "서비스 1개를 실제로 배포하는 실행 엔진"이다.

## 발표할 때 설명 순서

이 페이지를 설명할 때는 파일 단위보다 연결 구조로 설명하는 편이 좋다.

1. `App.tsx`가 `/git-actions`를 `GitActionsPage.tsx`에 연결한다.
2. `GitActionsPage.tsx`가 화면의 컨트롤러로서 모든 API 호출과 상태를 관리한다.
3. `server.ts`가 `githubRouter`, `fixRouter`를 붙여 브라우저 요청을 받는다.
4. `routes/github.ts`는 조회/실행 계열 API를, `routes/fix.ts`는 AI 제안/PR 생성 API를 처리한다.
5. `github/app.ts`가 GitHub App 인증을 담당하고, 그 위에서 `github/actions.ts`와 `github/changes.ts`가 실제 GitHub API를 호출한다.
6. `fix/suggest.ts`는 logs와 annotations를 바탕으로 분석하고, 필요하면 `llm/client.ts`를 통해 Gemini를 호출한다.
7. 최종적으로 `github/changes.ts`가 branch, commit, PR을 만들어 수정안을 GitHub에 반영한다.

짧게 한 문장으로 정리하면 다음과 같다.

> Git Actions 페이지는 `GitActionsPage.tsx`가 여러 백엔드 모듈을 조합해 GitHub Actions 관제, AI 분석, PR 생성을 한 화면에서 수행하도록 만든 운영 대시보드다.
