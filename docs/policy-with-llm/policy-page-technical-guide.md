# Policy Page Technical Guide

## 개요

이 문서는 `/policy` 페이지를 구성하는 파일들이 어떻게 연결되어 정책 생성 기능을 완성하는지 설명하는 기술 문서다.

이 페이지는 단순 업로드 화면이 아니다. 실제로는 아래 기능이 하나의 흐름으로 묶여 있다.

- 보안 가이드 PDF 업로드
- PDF 텍스트 추출
- 문서를 정책 항목 단위로 분리
- Checkov custom policy YAML 초안 생성
- 생성 결과 preview 표시
- registry 저장
- GitHub 저장소 반영
- 정책 비활성화 / 삭제

이 페이지를 이해할 때 가장 중요한 관점은 다음이다.

> `PolicyPage.tsx`가 화면의 오케스트레이터이고, `routes/policy.ts`는 HTTP 진입점이며, `policy/*.ts`가 실제 생성/적용/삭제/저장 로직을 수행하는 서비스 레이어다.

즉, 핵심은 개별 함수 하나가 아니라 "프론트 컨트롤러 -> Express 라우터 -> 정책 서비스 모듈 -> GitHub/LLM"의 연결 구조다.

## 이 페이지에 필요한 파일 트리

아래 트리는 저장소 전체가 아니라, 정책 페이지를 설명할 때 직접 필요한 파일만 추린 것이다.

```text
aws-security-project/
├─ controlplane/
│  ├─ web/
│  │  └─ src/
│  │     ├─ App.tsx                                      # /policy 라우트를 등록한다.
│  │     ├─ pages/
│  │     │  └─ PolicyPage.tsx                            # 이 페이지의 메인 컨트롤러. 업로드, preview, 저장, 적용, 삭제 액션이 모인다.
│  │     └─ data/
│  │        └─ mockData.ts                               # 정책 페이지에서 쓰는 타입 기반을 제공한다.
│  └─ api/
│     ├─ data/
│     │  └─ policy-registry.json                         # 생성된 정책 메타데이터를 저장하는 로컬 registry
│     └─ src/
│        ├─ server.ts                                    # Express 서버 시작점. policyRouter를 연결한다.
│        ├─ routes/
│        │  └─ policy.ts                                 # generate, apply, deactivate, registry CRUD API를 제공한다.
│        ├─ policy/
│        │  ├─ generate.ts                               # PDF -> 텍스트 -> 정책 항목 분리 -> LLM -> Checkov YAML 생성
│        │  ├─ apply.ts                                  # 생성된 YAML을 GitHub 기본 브랜치에 커밋한다.
│        │  ├─ remove.ts                                 # GitHub 기본 브랜치에서 기존 정책 파일을 삭제한다.
│        │  └─ registry.ts                               # policy-registry.json을 읽고 쓴다.
│        ├─ github/
│        │  ├─ app.ts                                    # GitHub App 인증과 installation token 발급을 담당한다.
│        │  └─ changes.ts                                # 기본 브랜치 커밋에 사용하는 GitHub Git Data API 유틸
│        └─ llm/
│           └─ client.ts                                 # Gemini 호출 공통 어댑터
├─ security/
│  └─ checkov/
│     └─ custom_policies/                                # 최종 YAML이 저장소에 들어가는 경로
└─ docs/
   └─ policy-with-llm/
      └─ policy-page-technical-guide.md                  # 현재 문서
```

## 기술 스택

| 기술 | 왜 쓰는가 | 실제 구현 위치 |
| --- | --- | --- |
| React + TypeScript + Vite | 업로드, preview, 상태 전환이 많은 운영 화면을 만들기 위해 | `controlplane/web/src/pages/PolicyPage.tsx` |
| Express + TypeScript | PDF 처리, LLM 호출, GitHub 반영을 서버에서 안전하게 수행하기 위해 | `controlplane/api/src/server.ts` |
| `pdf-parse` | PDF에서 실제 텍스트를 추출하기 위해 | `controlplane/api/src/policy/generate.ts` |
| Gemini API | 문서 문장을 Checkov policy definition으로 변환하기 위해 | `controlplane/api/src/llm/client.ts` |
| GitHub App + Octokit | 브라우저에 토큰을 숨기고 저장소를 제어하기 위해 | `controlplane/api/src/github/app.ts` |
| Git Data API | PR 없이 기본 브랜치에 직접 커밋/삭제하기 위해 | `controlplane/api/src/github/changes.ts` |
| JSON registry | 정책 목록과 메타데이터를 가볍게 저장하기 위해 | `controlplane/api/src/policy/registry.ts` |
| Checkov custom policy YAML | Terraform 리소스를 코드 정책으로 검사하기 위해 | `controlplane/api/src/policy/generate.ts` |

## 전체 연결 구조

이 페이지는 아래 4개 층이 연결되어 동작한다.

```text
1. 라우팅 층
   App.tsx
   -> /policy

2. 프론트 컨트롤러 층
   PolicyPage.tsx
   -> 업로드
   -> preview 상태 관리
   -> registry 조회/저장
   -> apply / deactivate / delete 버튼 처리

3. 백엔드 진입 층
   server.ts
   -> routes/policy.ts

4. 서비스 층
   policy/generate.ts
   -> PDF 분석 + YAML 생성
   policy/apply.ts
   -> GitHub 반영
   policy/remove.ts
   -> GitHub 삭제
   policy/registry.ts
   -> 로컬 registry 저장
   github/app.ts
   -> GitHub App 인증
   github/changes.ts
   -> 기본 브랜치 커밋
   llm/client.ts
   -> Gemini 호출
```

즉, 페이지 기능은 다음처럼 완성된다.

```text
사용자 PDF 업로드 또는 버튼 클릭
  -> PolicyPage.tsx
  -> /api/policies/*
  -> routes/policy.ts
  -> policy/generate.ts / apply.ts / remove.ts / registry.ts
  -> 필요 시 github/app.ts + github/changes.ts 사용
  -> 필요 시 llm/client.ts 로 Gemini 호출
  -> 결과를 다시 PolicyPage.tsx가 받아서 preview나 목록에 반영
```

## 기능 기준으로 파일 연결 보기

이 표가 가장 실무적으로 중요하다. 각 기능이 어떤 파일들을 거쳐 완성되는지 한 번에 보여준다.

| 사용자 기능 | 프론트 시작점 | API 진입점 | 실제 처리 파일 | 결과 |
| --- | --- | --- | --- | --- |
| registry 목록 표시 | `PolicyPage.tsx`의 초기 `useEffect()` | `GET /api/policies/registry` | `routes/policy.ts` -> `policy/registry.ts`의 `listRegistryPolicies()` | 저장된 정책 목록 표시 |
| PDF 분석 시작 | `analyzeFile()` | `POST /api/policies/generate` | `routes/policy.ts` -> `policy/generate.ts`의 `generatePolicyFromPdf()` | preview용 YAML 초안 생성 |
| preview 저장 | `handleCreatePolicy()` | `POST /api/policies/registry` | `routes/policy.ts` -> `policy/registry.ts`의 `createRegistryPolicies()` | registry에 정책 메타데이터 저장 |
| 정책 활성화 | `handleTogglePolicyStatus()` | `POST /api/policies/apply` | `routes/policy.ts` -> `policy/apply.ts` -> `github/changes.ts` | YAML을 기본 브랜치에 커밋 |
| 정책 비활성화 | `handleTogglePolicyStatus()` | `POST /api/policies/deactivate` | `routes/policy.ts` -> `policy/remove.ts` -> `github/changes.ts` | 기본 브랜치에서 YAML 삭제 |
| 정책 메타데이터 상태 반영 | `handleTogglePolicyStatus()` | `PATCH /api/policies/registry/:id` | `routes/policy.ts` -> `policy/registry.ts`의 `updateRegistryPolicy()` | registry status 갱신 |
| 정책 완전 삭제 | `handleDeletePolicy()` | `DELETE /api/policies/registry/:id` | `routes/policy.ts` -> `policy/remove.ts` + `policy/registry.ts` | GitHub 파일 삭제 후 registry 항목 제거 |

## 자세한 설명

### 1. 진입점: `App.tsx`

이 파일은 정책 페이지가 앱 안에서 어느 경로로 열릴지 결정한다.

```tsx
<Route path="policy" element={<PolicyPage />} />
```

역할은 하나다.

- `/policy` URL과 `PolicyPage.tsx`를 연결한다.

즉, 이 파일은 기능 수행 파일은 아니지만 페이지 진입 경로를 정의하는 시작점이다.

### 2. 프론트의 중심: `PolicyPage.tsx`

이 파일이 정책 페이지의 화면 컨트롤러다. 실제 사용자가 보는 기능 대부분이 여기서 시작된다.

이 파일이 맡는 역할은 다음과 같다.

- PDF 업로드
- 업로드 파일 검증
- base64 변환
- preview 상태 관리
- registry 목록 로드
- 정책 저장
- 정책 활성화 / 비활성화
- 정책 삭제

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

Git Actions 페이지와 비슷하게 정책 페이지도 거의 모든 기능이 이 함수로 서버에 들어간다.

- registry 조회
- 정책 생성
- registry 저장
- apply
- deactivate
- delete

즉, 프론트와 백엔드를 잇는 공통 관문이다.

#### 핵심 코드 2: PDF 업로드 후 생성 요청

```ts
const analyzeFile = async (file: File) => {
  const contentBase64 = await fileToBase64(file)
  const result = await apiFetch('/api/policies/generate', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      contentBase64,
    }),
  })

  setPreview(result)
}
```

이 코드가 보여주는 구조는 명확하다.

- 브라우저는 PDF 바이너리를 직접 multipart로 보내지 않는다.
- 먼저 base64로 바꾼 뒤 JSON body로 `/generate`에 보낸다.
- 백엔드가 이 요청을 받아 실제 PDF 처리와 YAML 생성을 수행한다.

즉, `PolicyPage.tsx`는 문서를 직접 해석하지 않고 생성 요청만 시작한다.

#### 핵심 코드 3: registry 초기 로드

```ts
useEffect(() => {
  void apiFetch('/api/policies/registry')
    .then((result) => {
      setPolicies(Array.isArray(result.policies) ? result.policies : [])
    })
}, [])
```

즉, 페이지가 열리면 먼저 로컬 registry에 저장된 정책 목록을 가져와 화면 오른쪽 목록에 표시한다.

#### 핵심 코드 4: 정책 활성화 / 비활성화

```ts
if (target.status === 'active') {
  await apiFetch('/api/policies/deactivate', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
} else {
  await apiFetch('/api/policies/apply', {
    method: 'POST',
    body: JSON.stringify({
      policies: [{ policyPath: target.policyPath, yaml: target.yaml }],
    }),
  })
}
```

이 코드의 의미는 다음과 같다.

- 생성과 저장은 다르다.
- registry에 저장된 정책이 있어도 실제 GitHub 저장소에 반영되지 않을 수 있다.
- `active` / `paused` 전환은 결국 GitHub YAML 파일을 넣거나 빼는 작업이다.

즉, `PolicyPage.tsx`는 정책을 "생성"하는 화면이면서 동시에 "운영"하는 화면이다.

### 3. Express 진입점: `server.ts`

`server.ts`는 정책 기능을 직접 구현하지는 않지만, `policyRouter`를 Express에 붙여서 브라우저 요청이 백엔드로 들어오게 만든다.

핵심 구조는 다음과 같다.

```ts
app.use(policyRouter)
```

즉, 정책 관련 모든 브라우저 요청은 결국 `routes/policy.ts`로 들어간다.

### 4. HTTP 계약 층: `routes/policy.ts`

이 파일은 정책 페이지에서 쓰는 모든 API 명세를 제공한다. 실제 로직을 길게 갖지 않고, 검증 후 서비스 함수에 위임한다.

이 파일이 제공하는 대표 API는 다음과 같다.

- `GET /api/policies/registry`
- `POST /api/policies/registry`
- `PATCH /api/policies/registry/:id`
- `DELETE /api/policies/registry/:id`
- `POST /api/policies/generate`
- `POST /api/policies/apply`
- `POST /api/policies/deactivate`

#### 핵심 코드: generate 요청 위임

```ts
policyRouter.post('/api/policies/generate', async (req, res, next) => {
  const result = await generatePolicyFromPdf({
    fileName: body.fileName || '',
    contentBase64: body.contentBase64 || '',
    mimeType: body.mimeType,
  })
  res.json(result)
})
```

이 파일의 역할은 분명하다.

- request body 구조를 받는다.
- 필요한 최소 검증을 한다.
- 실제 생성/적용/삭제/저장 로직은 `policy/*.ts`에 맡긴다.

즉, `routes/policy.ts`는 정책 페이지 백엔드의 HTTP 관문이다.

### 5. PDF -> YAML 생성 엔진: `policy/generate.ts`

이 파일이 정책 페이지의 핵심이다. 업로드된 PDF를 사람이 읽는 문서에서 기계가 검사할 수 있는 Checkov YAML로 변환한다.

이 파일의 내부 흐름은 다음과 같다.

```text
PDF 입력
  -> 입력 검증
  -> base64 디코딩
  -> PDF 텍스트 추출
  -> source policy 단위 분리
  -> 로컬 분류
  -> Gemini 호출
  -> LLM 응답 검증
  -> Checkov YAML 직렬화
  -> preview 응답 반환
```

#### 핵심 코드 1: 전체 진입 함수

```ts
export async function generatePolicyFromPdf(input: GeneratePolicyRequest): Promise<GeneratePolicyResponse> {
  const sourcePolicies = extractSourcePolicies(input.fileName, text)
  const llmResult = await generateWithLlm(input.fileName, sourcePolicies)
  const policies = resolvedDrafts.map((draft) => ({
    policyPath: `security/checkov/custom_policies/${draft.fileName}`,
    yaml: buildCustomPolicyYaml(draft),
    ...
  }))

  return {
    ok: true,
    mode: 'llm',
    ...
  }
}
```

이 코드가 보여주는 구조는 다음과 같다.

- PDF 전체를 바로 저장하지 않는다.
- 먼저 source policy 단위로 나눈다.
- 그 결과를 Checkov YAML 아티팩트로 변환한다.
- 최종 결과는 저장소 경로까지 포함한 preview 형태로 반환된다.

#### 핵심 코드 2: source policy 단위 분리

`extractSourcePolicies()`가 문서를 항목 단위로 쪼개는 이유는, PDF 전체를 한 번에 LLM에 넘기면 결과가 불안정해질 수 있기 때문이다.

즉, 이 파일은 "긴 문서 전체를 한 번에 처리"하는 대신 "작은 정책 단위로 분해해서 처리"하는 구조다.

#### 핵심 코드 3: LLM 생성 + 검증

```ts
for (const sourcePolicy of sourcePolicies) {
  const localClassification = classifySourcePolicyLocally(fileName, sourcePolicy)
  ...
  const response = await callConfiguredLlm({
    messages: [
      { role: 'system', content: buildPolicyDefinitionSystemPrompt() },
      { role: 'user', content: buildPolicyDefinitionPrompt(...) },
    ],
    responseMimeType: 'application/json',
  })
  ...
}
```

이 부분이 중요한 이유는, 이 프로젝트가 "AI에게 아무 JSON이나 받아서 바로 저장"하지 않기 때문이다.

실제로는 다음 검증이 들어간다.

- JSON 파싱 가능한지
- `definition`이 객체인지
- Terraform AWS `resource_types`가 들어 있는지

즉, `generate.ts`는 단순 AI 호출 파일이 아니라 "생성 + 검증 + 직렬화"를 모두 맡는 핵심 모듈이다.

#### 핵심 코드 4: 최종 YAML 생성

`buildCustomPolicyYaml()`이 최종 Checkov YAML 문자열을 만든다. 즉, LLM 응답을 그대로 저장하지 않고, 프로젝트가 기대하는 YAML 포맷으로 다시 직렬화한다.

### 6. LLM 전송 레이어: `llm/client.ts`

이 파일은 정책 생성 비즈니스 로직의 중심이 아니다. `generate.ts`가 준비한 프롬프트를 Gemini API로 보내는 전송 계층이다.

핵심 코드:

```ts
export async function callConfiguredLlm(input: LlmRequest): Promise<LlmResponse | null> {
  if (!env.llmApiKey) {
    return null
  }

  return callGemini(input)
}
```

즉, `client.ts`는 다음만 담당한다.

- API 키 확인
- Gemini 요청 body 조립
- 실제 `generateContent` 호출

이 파일이 분리된 이유는 다음과 같다.

- `generate.ts`의 정책 생성 로직과 LLM 통신 로직을 섞지 않기 위해
- provider 교체 여지를 남기기 위해
- API 키를 브라우저에 숨기기 위해

### 7. registry 저장소: `policy/registry.ts`

이 파일은 생성된 정책 메타데이터를 로컬 JSON 파일에 저장한다. 정책 페이지가 단순 생성 화면이 아니라 "운영 목록" 화면이 될 수 있는 이유가 이 파일 때문이다.

핵심 코드:

```ts
const STORE_PATH = path.resolve(process.cwd(), 'data', 'policy-registry.json')
```

즉, registry는 DB가 아니라 `controlplane/api/data/policy-registry.json` 파일 기반이다.

이 파일의 역할은 다음과 같다.

- 정책 목록 읽기
- 정책 단건 조회
- 정책 여러 개 생성
- 정책 상태 업데이트
- 정책 삭제

#### 핵심 코드: 정책 생성

```ts
export async function createRegistryPolicies(input: RegistryPolicy[]) {
  const store = await readStore()
  ...
  const policies = [...nextPolicies, ...store.policies]
  await writeStore({ policies })
  return nextPolicies
}
```

즉, registry는 실제 YAML 파일 저장소가 아니라:

- 정책 카드 목록
- 상태값 `draft / active / paused`
- description, severity, provider

같은 운영 메타데이터를 관리하는 저장소다.

### 8. GitHub 반영 엔진: `policy/apply.ts`

이 파일은 생성된 YAML을 실제 저장소에 넣는 역할을 한다. 중요한 점은 현재 구조가 PR 생성이 아니라 기본 브랜치 직접 커밋이라는 점이다.

핵심 코드:

```ts
export async function applyPolicyworkflow(input: ApplyPolicyRequest): Promise<ApplyPolicyResponse> {
  const policies = rawPolicies.map(validatePolicyFile)
  const result = await commitFilesToDefaultBranch({
    runId: `policy-${Date.now()}`,
    commitMessage: ...,
    files: policies.map((policy) => ({
      path: policy.policyPath,
      content: policy.yaml,
    })),
  })
  ...
}
```

이 코드가 보여주는 구조는 다음과 같다.

- policyPath가 `security/checkov/custom_policies/*.yaml`인지 검증
- yaml 안에 `metadata`와 `definition` 블록이 있는지 검증
- 검증된 파일만 기본 브랜치에 직접 커밋

즉, `apply.ts`는 "생성된 결과를 실제 정책 파일로 배포하는 모듈"이다.

### 9. GitHub 삭제 엔진: `policy/remove.ts`

이 파일은 apply의 반대 역할을 한다. registry에서 정책을 없애기 전에, 실제 GitHub 저장소의 YAML 파일도 지워 준다.

핵심 코드:

```ts
const existsOnBase = await checkFileExistsOnDefaultBranch(policyPath, baseBranch)

if (!existsOnBase) {
  return {
    ok: true,
    deleted: true,
    githubFileDeleted: false,
  }
}

const result = await commitFilesToDefaultBranch({
  runId: `policy-delete-${Date.now()}`,
  commitMessage: `policy: remove ${fileName}`,
  files: [{ path: policyPath, delete: true }],
})
```

이 구조가 중요한 이유는 다음과 같다.

- 먼저 실제 GitHub 기본 브랜치에 파일이 있는지 확인한다.
- 있으면 delete commit을 만든다.
- 없으면 registry 삭제만 성공 처리한다.

즉, `remove.ts`는 "정책 삭제"를 GitHub 파일 상태까지 맞춰 주는 정리 모듈이다.

### 10. GitHub 인증과 커밋 유틸: `github/app.ts`, `github/changes.ts`

정책 페이지도 GitHub 저장소를 수정해야 하므로 브라우저가 직접 GitHub를 호출하면 안 된다. 그래서 `github/app.ts`와 `github/changes.ts`가 필요하다.

#### `github/app.ts`

이 파일은 GitHub App 인증과 installation token 기반 Octokit 생성 역할을 한다.

핵심 구조:

```ts
export async function getRepoOctokit() {
  const installation = await getInstallationForRepository()
  return githubApp.getInstallationOctokit(installation.id)
}
```

즉, 정책 apply/delete는 모두 이 인증 흐름 위에서 수행된다.

#### `github/changes.ts`

정책 페이지에서는 `commitFilesToDefaultBranch()`가 핵심이다.

이 함수는 다음 순서로 동작한다.

1. 기본 브랜치 ref 조회
2. base commit 조회
3. 파일을 blob/tree로 구성
4. commit 생성
5. 기본 브랜치 ref 업데이트

즉, 정책 페이지는 PR을 만들지 않고 기본 브랜치를 직접 전진시키는 구조다.

### 11. 최종 저장 위치: `security/checkov/custom_policies/`

정책 페이지의 산출물은 메모리 안에서 끝나지 않는다. 최종적으로는 저장소 안의 실제 Checkov 정책 파일이 된다.

경로는 항상 이 패턴을 따른다.

```text
security/checkov/custom_policies/<generated-file>.yaml
```

즉, 이 폴더는 정책 페이지의 "배포 대상"이다. registry는 메타데이터용이고, 이 폴더 안 YAML은 실제 검사 자산이다.

## 발표할 때 설명 순서

이 페이지를 설명할 때는 파일 이름 나열보다 연결 구조로 설명하는 편이 좋다.

1. `App.tsx`가 `/policy`를 `PolicyPage.tsx`에 연결한다.
2. `PolicyPage.tsx`가 PDF 업로드, preview, 목록, apply/deactivate/delete 버튼을 관리한다.
3. `routes/policy.ts`가 generate, apply, deactivate, registry API를 받아 적절한 서비스 모듈로 넘긴다.
4. `policy/generate.ts`가 PDF를 읽고 정책 항목을 분리한 뒤 Gemini를 통해 Checkov YAML을 만든다.
5. `policy/registry.ts`가 생성된 정책 메타데이터를 JSON registry에 저장한다.
6. `policy/apply.ts`와 `policy/remove.ts`가 GitHub 저장소의 실제 YAML 파일을 넣거나 삭제한다.
7. 이 과정에서 `github/app.ts`가 GitHub App 인증을 담당하고, `github/changes.ts`가 기본 브랜치 커밋을 수행한다.

짧게 한 문장으로 정리하면 다음과 같다.

> 정책 페이지는 `PolicyPage.tsx`가 여러 백엔드 모듈을 조합해 보안 가이드 PDF를 Checkov custom policy YAML로 변환하고, 그 결과를 registry와 GitHub 저장소에 반영하는 운영 대시보드다.
