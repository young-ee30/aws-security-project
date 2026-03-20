# GitHub Actions PIPELINE 시각화 & LLM 에러 분석

대시보드의 GitHub Actions 페이지(`/git-actions`)에 **PIPELINE 시각화**, **Step 타임라인 요약**, **LLM 에러 분석** 기능을 추가한 구현 기술서입니다.

---

## 1. 전체 구조

```
기존: 실행 목록 → Job 펼치기 → 원시 로그(수백 줄)
변경: 실행 목록 → PIPELINE 그래프 → Step 타임라인(한국어 요약) → 원시 로그(토글)
```

### 변경 파일 목록

| 구분 | 파일 | 설명 |
|------|------|------|
| **백엔드 (신규)** | `controlplane/api/src/fix/summarize.ts` | Rule-based Step 요약 모듈 |
| **백엔드 (수정)** | `controlplane/api/src/fix/suggest.ts` | LLM 에러 분석 하이브리드 모드 추가 |
| **백엔드 (수정)** | `controlplane/api/src/routes/github.ts` | `/api/github/runs/:runId/summary` 엔드포인트 |
| **프론트엔드 (신규)** | `controlplane/web/src/components/pipeline/PipelineGraph.tsx` | CSS PIPELINE 그래프 |
| **프론트엔드 (신규)** | `controlplane/web/src/components/pipeline/StepTimeline.tsx` | Step 타임라인 컴포넌트 |
| **프론트엔드 (수정)** | `controlplane/web/src/pages/GitActionsPage.tsx` | 전체 통합 |

---

## 2. 기능 설명

### 2-1. PIPELINE 그래프 (`PipelineGraph.tsx`)

GitHub Actions에서 보이는 workflow 시각화를 CSS로 구현합니다.

**동작 원리:**
1. GitHub API에서 받아온 Job 데이터를 `startedAt` 시간순으로 정렬
2. 5초 이내에 시작한 Job들은 **병렬 실행**으로 판단 → 세로로 배치
3. 순차 실행 Job들은 **화살표(→)** 로 연결

**상태별 색상:**
| 상태 | 노드 색상 | 아이콘 |
|------|----------|--------|
| 성공 | 초록 테두리 | ✅ `CheckCircle2` |
| 실패 | 빨간 테두리 | ❌ `XCircle` |
| 진행중 | 파란 테두리 (pulse) | ⏳ `Clock` |
| 건너뜀 | 회색 테두리 | ⏭️ `SkipForward` |

**핵심 코드:**
```tsx
// Job들을 시간 기반으로 그룹핑
function groupJobsByExecution(jobs: PipelineJob[]): JobGroup[] {
  // startedAt 기준 정렬 → 5초 이내 = 같은 그룹(병렬)
}
```

---

### 2-2. Step 타임라인 (`StepTimeline.tsx`)

각 Job 내부의 Step들을 세로 타임라인으로 시각화합니다.

**특징:**
- 각 Step에 상태 아이콘 + 이름 + **한국어 요약** + 소요시간 표시
- 진행중인 Step은 `animate-pulse` 로 강조
- `Set up job`, `Complete job`, `Post ...` 같은 래퍼 Step은 자동 필터링
- 실패한 Step은 빨간 배경으로 강조

---

### 2-3. Rule-based 요약 (`summarize.ts`) — 상세 동작 원리

Step 이름을 **정규식 패턴 매칭**하여 한국어 요약을 생성합니다. LLM 없이 즉시 동작합니다.

**API 엔드포인트:**
```
GET /api/github/runs/:runId/summary
```

#### 동작 흐름

```
1. GitHub API에서 해당 Run의 Job 목록 조회
   └→ getworkflowRunJobs(runId)

2. 각 Job 안의 Step마다 STEP_PATTERNS 배열을 순회
   └→ Step 이름(예: "Terraform Plan")을 정규식으로 검사
   └→ 매칭되면 해당 한국어 요약 반환
   └→ 매칭 안 되면 Step 이름 그대로 사용

3. 각 Step 요약 앞에 상태 이모지 라벨 추가
   └→ 완료+성공: "✅ 완료:"
   └→ 완료+실패: "❌ 실패:"
   └→ 진행중:    "⏳ 진행중:"
   └→ 건너뜀:    "⏭️ 건너뜀:"

4. Job 레벨 요약 생성
   └→ 진행중: "3/10 단계 진행중 — 현재: Terraform Plan"
   └→ 성공:   "전체 10단계 성공 완료"
   └→ 실패:   "Terraform Apply 단계에서 실패"

5. 전체 Run의 현재 단계 판별
   └→ 진행중 Job이 있으면: 해당 Job + 현재 Step 표시
   └→ 모두 성공: "모든 작업 완료 ✅"
   └→ 실패 있으면: "Terraform Apply 실패 ❌"
```

#### 패턴 매칭 과정 예시

GitHub Actions에서 `"Terraform Plan (dev)"` 이라는 Step이 실행될 때:

```typescript
// 1. STEP_PATTERNS 배열을 위에서 아래로 순회
const STEP_PATTERNS = [
  { test: (n) => /checkout\s*code/i.test(n), summary: '소스 코드를 체크아웃하는 단계' },
  { test: (n) => /terraform\s*plan/i.test(n), summary: '인프라 변경사항을 미리 확인하는 단계' },
  // ...
]

// 2. "Terraform Plan (dev)" → /terraform\s*plan/i 에 매칭됨!
//    → summary = '인프라 변경사항을 미리 확인하는 단계'

// 3. 상태 라벨 추가
//    status='completed', conclusion='success'
//    → getStepStatusLabel() → '✅ 완료:'

// 4. 최종 결과
//    → "✅ 완료: 인프라 변경사항을 미리 확인하는 단계"
```

#### 현재 등록된 패턴 (29개)

| 카테고리 | 정규식 | 한국어 요약 |
|---------|--------|------------|
| **Git** | `checkout\s*code` | 소스 코드를 체크아웃하는 단계 |
| **AWS** | `configure\s*aws` | AWS 자격증명을 설정하는 단계 |
| **Terraform** | `setup\s*terraform` | Terraform CLI를 설치하는 단계 |
| | `terraform\s*init` | Terraform 프로바이더와 모듈을 초기화하는 단계 |
| | `terraform\s*validate` | Terraform 구성의 문법을 검증하는 단계 |
| | `terraform\s*plan` | 인프라 변경사항을 미리 확인하는 단계 |
| | `terraform\s*apply` | 인프라 변경을 실제로 적용하는 단계 |
| | `terraform\s*format` | Terraform 코드 포맷을 검사하는 단계 |
| **보안** | `checkov` | IaC 보안 스캔으로 취약점을 검사하는 단계 |
| | `trivy\|scan.*image` | 컨테이너 이미지 보안 스캔 단계 |
| **Docker/ECS** | `docker.*build` | Docker 이미지를 빌드하는 단계 |
| | `push.*image\|ecr.*push` | Docker 이미지를 ECR에 푸시하는 단계 |
| | `deploy.*service` | 서비스를 ECS에 배포하는 단계 |
| | `login.*ecr` | ECR 레지스트리에 로그인하는 단계 |
| **기타** | `post\s` | 후처리 정리 단계 |
| | `complete\s*job` | Job 완료 정리 단계 |

> 패턴은 위→아래 순서로 매칭하므로, 더 **구체적인 패턴이 위에**, 일반적인 패턴이 아래에 위치합니다.
> 예: `checkout\s*code`(구체적)가 `checkout`(일반적)보다 위에 있어야 합니다.

#### 패턴 추가 방법

```typescript
// summarize.ts의 STEP_PATTERNS 배열에 추가
{ test: (n) => /my\s*custom\s*step/i.test(n), summary: '커스텀 작업 단계' },
```

#### 응답 예시

```json
{
  "runId": 12345,
  "overallSummary": "총 2개 Job · 2개 성공",
  "currentPhase": "모든 작업 완료 ✅",
  "jobs": [
    {
      "jobId": 111,
      "name": "Terraform Plan & Security Scan",
      "summary": "전체 10단계 성공 완료",
      "steps": [
        {
          "name": "Checkout code",
          "summary": "✅ 완료: 소스 코드를 체크아웃하는 단계",
          "durationSeconds": 2
        },
        {
          "name": "Checkov IaC Scan",
          "summary": "✅ 완료: IaC 보안 스캔으로 취약점을 검사하는 단계",
          "durationSeconds": 45
        }
      ]
    }
  ]
}
```

---

### 2-4. LLM 에러 분석 (`suggest.ts`) — 상세 프롬프트 설계

**실패한 workflow**에서 "AI 에러 분석" 버튼을 누르면 동작합니다.

#### 전체 분석 흐름

```
프론트엔드: "AI 에러 분석" 버튼 클릭
    ↓
POST /api/fix/suggest { runId: 12345 }
    ↓
generateFixSuggestion(runId) 함수 실행
    │
    ├─ 1단계: GitHub API에서 원시 로그 가져오기
    │   └→ getworkflowRunLogs(runId)   // 전체 로그 다운로드
    │   └→ getworkflowRunJobs(runId)   // Job/Step 메타데이터
    │
    ├─ 2단계: 로그 정규화
    │   └→ ANSI 컬러코드 제거
    │   └→ timestamp 제거
    │   └→ UTF-8 이상문자 제거
    │
    ├─ 3단계: Rule-based 패턴 매칭 (즉시, 무료)
    │   └→ suggest.ts 안의 5~6개 알려진 에러 패턴 검사
    │   └→ 매칭되면: 사전 정의된 원인/해결방안 반환
    │   └→ 안 되면: "수동 확인 필요" 제네릭 응답
    │
    ├─ 4단계: LLM 에러 분석 (선택적)
    │   └→ LLM_API_KEY 환경변수 체크
    │   └→ 없으면: 건너뜀 (rule-based만 반환)
    │   └→ 있으면: callLlmAnalysis() 실행
    │       └→ 로그 마지막 12,000자 + rule-based 사전 분석 결과를 LLM에 전달
    │       └→ LLM이 한국어로 에러원인/해결방안/영향범위 생성
    │
    └─ 5단계: 결과 병합 (하이브리드)
        └→ mode: 'hybrid' (LLM 있을 때) 또는 'rule-based' (없을 때)
        └→ rule-based 필드들 + llmAnalysis 필드 함께 반환
```

#### LLM 프롬프트 설계 — 상세

OpenAI Chat Completions API를 사용합니다. `messages` 배열에 system/user 두 메시지를 보냅니다:

**System 프롬프트 (역할 설정):**
```
You are a DevOps expert analyzing GitHub Actions workflow failure logs.
Respond ONLY in Korean. Be concise but thorough.
Format your response as:
## 에러 원인
(1-2 sentences explaining the root cause)
## 해결 방안
(numbered list of concrete steps to fix)
## 영향 범위
(brief impact assessment)
```

**설계 의도:**
- `"DevOps expert"` → DevOps 맥락의 에러를 더 정확하게 분석
- `"Respond ONLY in Korean"` → 한국어 응답 강제
- 포맷을 `## 에러 원인` / `## 해결 방안` / `## 영향 범위` 3섹션으로 고정 → 프론트엔드에서 일관된 표시
- `"Be concise but thorough"` → 너무 길지 않게, 핵심만

**User 프롬프트 (로그 전달):**
```
Rule-based 사전 분석: {rule-based 결과 요약}

아래는 실패한 GitHub Actions workflow의 원시 로그입니다.
에러 원인과 해결 방안을 분석해주세요.

```
{원시 로그 최대 12,000자 — 마지막 부분 우선}
```
```

**설계 의도:**
- `"Rule-based 사전 분석"` → LLM이 이미 감지된 패턴을 중복 분석하지 않도록
- `logText.slice(-12000)` → 에러는 보통 로그 **끝부분**에 있으므로, 뒤에서 12,000자를 잘라서 전달
- 12,000자 제한 → 토큰 비용 절약 + API 속도 확보 (약 3,000~4,000 토큰)

#### API 호출 파라미터

```typescript
{
  model: env.llmModel,        // 기본값: 'gpt-5.4-mini' (env에서 변경 가능)
  messages: [system, user],
  max_tokens: 1000,           // 응답 최대 길이 제한
  temperature: 0.3,           // 낮은 온도 = 일관되고 정확한 분석
}
```

| 파라미터 | 값 | 이유 |
|---------|-----|------|
| `max_tokens` | 1000 | 에러 분석은 길 필요 없음. 비용 절약 |
| `temperature` | 0.3 | 창의적 응답보다 정확한 분석이 중요 |
| 로그 길이 | 12,000자 | 약 3-4K 토큰. gpt-4o-mini 기준 약 $0.001/건 |

#### 에러 핸들링

```
LLM API 호출 실패 시:
  → console.error로 로그 기록
  → null 반환 (rule-based 결과만 정상 반환)
  → 사용자에게는 mode:'rule-based'로 표시
  → 에러 propagation 없음 (graceful degradation)
```

**→ LLM이 죽어도 rule-based 결과는 항상 나옵니다.**

#### LLM 연동 설정 (`.env`)

```env
# 선택사항 - 없으면 rule-based만 동작
LLM_API_KEY=sk-your-openai-api-key
LLM_MODEL=gpt-4o-mini    # 기본값: gpt-5.4-mini
```

#### 실제 LLM 응답 예시

```markdown
## 에러 원인
Terraform Apply 단계에서 IAM Role `ecs-task-role`이 이미 AWS에 존재하지만
Terraform state에는 등록되어 있지 않아 리소스 충돌이 발생했습니다.

## 해결 방안
1. `terraform import aws_iam_role.ecs_task_role ecs-task-role` 명령으로 기존 리소스를 state에 등록
2. 또는 `.github/workflows/terraform-dev-plan-apply.yml`의 import orphan 단계에 해당 리소스 추가
3. 이후 `terraform plan`으로 drift 없는지 확인

## 영향 범위
ECS 서비스 배포에 직접 영향. 현재 실행중인 서비스에는 영향 없으나,
새로운 배포가 불가한 상태입니다.
```

---

## 3. 프론트엔드 UI 변경

### 변경 전
```
[workflow 목록] → [Job 펼침] → [Steps 목록(점, 이름만)] → [원시 로그(항상 표시)]
```

### 변경 후
```
[workflow 목록]
  ↓
[PIPELINE 그래프] ← 상단에 Job 흐름 시각화
[현재 단계 배지]   ← "모든 작업 완료 ✅" / "Terraform Apply 실행중"
  ↓
[Job 펼침]
  ├─ [Step 타임라인] ← 아이콘 + 한국어 요약 + 소요시간
  ├─ [원시 로그 보기] ← 토글 버튼 (기본 숨김)
  └─ [AI 에러 분석]  ← 실패 시에만 활성화, LLM 분석 결과 카드
```

### 주요 UX 변경점

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| Job 흐름 | 목록만 표시 | PIPELINE 그래프 (노드 + 화살표) |
| Step 표시 | 점 + 이름 | 타임라인 + 한국어 요약 + 소요시간 |
| 원시 로그 | 항상 표시 (수백 줄) | "원시 로그 보기" 토글로 숨김 |
| AI 버튼 | "AI 도움 받기" (항상 활성) | "AI 에러 분석" (실패 시에만 활성) |
| AI 결과 | rule-based만 | LLM 분석 + rule-based 하이브리드 |

---

## 4. 로컬에서 확인하기

```bash
# 1. 백엔드 실행
cd controlplane/api
npm run dev

# 2. 프론트엔드 실행
cd controlplane/web
npm run dev

# 3. 브라우저에서 확인
# http://localhost:5173/git-actions
```

### 확인 포인트

1. **PIPELINE 그래프**: workflow 선택 시 상단에 Job 노드가 화살표로 연결되어 나타남
2. **현재 단계 배지**: PIPELINE 그래프 아래에 "모든 작업 완료 ✅" 또는 현재 진행 단계 표시
3. **Step 타임라인**: Job 펼침 시 각 Step에 아이콘과 한국어 요약 표시
4. **원시 로그 토글**: "원시 로그 보기" 버튼 클릭 시에만 원시 로그 표시
5. **AI 에러 분석**: 실패한 workflow에서 "AI 에러 분석" 버튼 클릭 → 분석 결과 카드

---

## 5. 커스터마이즈

### Step 요약 패턴 추가

`controlplane/api/src/fix/summarize.ts`의 `STEP_PATTERNS` 배열에 추가:

```typescript
{ test: (n) => /새로운패턴/i.test(n), summary: '이 단계의 한국어 설명' },
```

### 에러 분석 규칙 추가

`controlplane/api/src/fix/suggest.ts`의 `matchSuggestionRule()` 함수에 새 패턴 추가:

```typescript
if (/새로운에러패턴/i.test(logText)) {
  return {
    ruleId: 'my-custom-rule',
    title: '규칙 이름',
    summary: '에러 설명',
    rootCause: '원인',
    riskLevel: 'medium',
    nextActions: ['조치 1', '조치 2'],
    candidateFiles: [{ path: '관련 파일', reason: '이유' }],
  }
}
```

---

## 6. 핵심 소스 코드

### 6-1. `summarize.ts` — Rule-based Step 요약 (백엔드)

> 경로: `controlplane/api/src/fix/summarize.ts`

```typescript
import { getworkflowRunJobs, getworkflowRunLogs } from '../github/actions.js'

type workflowJob = Awaited<ReturnType<typeof getworkflowRunJobs>>[number]
type workflowStep = workflowJob['steps'][number]

interface StepSummary {
  name: string
  number: number
  status: string
  conclusion: string | null
  summary: string
  durationSeconds: number | null
}

interface JobSummary {
  jobId: number
  name: string
  status: string
  conclusion: string | null
  summary: string
  durationSeconds: number | null
  steps: StepSummary[]
}

export interface RunSummaryResponse {
  runId: number
  jobs: JobSummary[]
  overallSummary: string
  currentPhase: string | null
}

function computeDuration(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.floor((end - start) / 1000)
}

// ★ Step 이름 → 한국어 요약 매핑 테이블 (여기에 새 패턴 추가)
const STEP_PATTERNS: Array<{ test: (name: string) => boolean; summary: string }> = [
  { test: (n) => /checkout\s*code/i.test(n), summary: '소스 코드를 체크아웃하는 단계' },
  { test: (n) => /configure\s*aws/i.test(n), summary: 'AWS 자격증명을 설정하는 단계' },
  { test: (n) => /setup\s*terraform/i.test(n), summary: 'Terraform CLI를 설치하는 단계' },
  { test: (n) => /resolve\s*state\s*bucket/i.test(n), summary: 'Terraform state 버킷을 확인하는 단계' },
  { test: (n) => /check\s*terraform\s*secrets/i.test(n), summary: '필수 시크릿 값이 설정됐는지 확인하는 단계' },
  { test: (n) => /create\s*backend/i.test(n), summary: 'Terraform 백엔드 설정 파일을 생성하는 단계' },
  { test: (n) => /terraform\s*format/i.test(n), summary: 'Terraform 코드 포맷을 검사하는 단계' },
  { test: (n) => /terraform\s*init/i.test(n), summary: 'Terraform 프로바이더와 모듈을 초기화하는 단계' },
  { test: (n) => /terraform\s*validate/i.test(n), summary: 'Terraform 구성의 문법을 검증하는 단계' },
  { test: (n) => /checkov/i.test(n), summary: 'IaC 보안 스캔으로 취약점을 검사하는 단계' },
  { test: (n) => /terraform\s*plan/i.test(n), summary: '인프라 변경사항을 미리 확인하는 단계' },
  { test: (n) => /terraform\s*apply/i.test(n), summary: '인프라 변경을 실제로 적용하는 단계' },
  { test: (n) => /import\s*orphan.*iam/i.test(n), summary: '기존 IAM 리소스를 Terraform state로 가져오는 단계' },
  { test: (n) => /import\s*orphan.*log/i.test(n), summary: '기존 CloudWatch 로그 그룹을 state로 가져오는 단계' },
  { test: (n) => /import\s*orphan.*target/i.test(n), summary: '기존 ALB 타겟 그룹을 state로 가져오는 단계' },
  { test: (n) => /clean\s*orphan.*efs/i.test(n), summary: '사용되지 않는 EFS 파일시스템을 정리하는 단계' },
  { test: (n) => /resolve.*commit/i.test(n), summary: '배포할 커밋 SHA를 결정하는 단계' },
  { test: (n) => /resolve.*active.*backend/i.test(n), summary: '활성 백엔드 서비스를 확인하는 단계' },
  { test: (n) => /build.*service.*matrix/i.test(n), summary: '배포 대상 서비스 목록을 생성하는 단계' },
  { test: (n) => /resolve.*service.*config/i.test(n), summary: '서비스별 ECS/ECR 설정을 결정하는 단계' },
  { test: (n) => /deploy.*service/i.test(n), summary: '서비스를 ECS에 배포하는 단계' },
  { test: (n) => /docker.*build|build.*image/i.test(n), summary: 'Docker 이미지를 빌드하는 단계' },
  { test: (n) => /push.*image|ecr.*push/i.test(n), summary: 'Docker 이미지를 ECR에 푸시하는 단계' },
  { test: (n) => /login.*ecr/i.test(n), summary: 'ECR 레지스트리에 로그인하는 단계' },
  { test: (n) => /trivy|scan.*image|security.*scan/i.test(n), summary: '컨테이너 이미지 보안 스캔 단계' },
  { test: (n) => /checkout/i.test(n), summary: '소스 코드를 체크아웃하는 단계' },
  { test: (n) => /set\s*up|setup/i.test(n), summary: '도구 및 환경을 설정하는 단계' },
  { test: (n) => /post\s/i.test(n), summary: '후처리 정리 단계' },
  { test: (n) => /complete\s*job/i.test(n), summary: 'Job 완료 정리 단계' },
]

// ★ Step 이름을 STEP_PATTERNS에서 찾아 한국어 요약 생성
function summarizeStep(step: workflowStep): string {
  for (const pattern of STEP_PATTERNS) {
    if (pattern.test(step.name)) {
      const statusLabel = getStepStatusLabel(step.status, step.conclusion)
      return `${statusLabel} ${pattern.summary}`
    }
  }
  return getStepStatusLabel(step.status, step.conclusion) + ' ' + step.name
}

// ★ 상태 이모지 라벨
function getStepStatusLabel(status: string, conclusion: string | null): string {
  if (status !== 'completed') return '⏳ 진행중:'
  if (conclusion === 'success') return '✅ 완료:'
  if (conclusion === 'skipped') return '⏭️ 건너뜀:'
  if (conclusion === 'failure') return '❌ 실패:'
  return '⚠️ 종료:'
}

// ★ Job 전체 진행률 요약
function summarizeJob(job: workflowJob): string {
  const totalSteps = job.steps.length
  const completedSteps = job.steps.filter((s) => s.status === 'completed').length
  const failedSteps = job.steps.filter((s) => s.conclusion === 'failure')

  if (job.status !== 'completed') {
    const activeStep = job.steps.find((s) => s.status === 'in_progress')
    if (activeStep) {
      return `${completedSteps}/${totalSteps} 단계 진행중 — 현재: ${activeStep.name}`
    }
    return `${completedSteps}/${totalSteps} 단계 진행중`
  }

  if (job.conclusion === 'success') return `전체 ${totalSteps}단계 성공 완료`
  if (failedSteps.length > 0) return `${failedSteps.map((s) => s.name).join(', ')} 단계에서 실패`
  return `${job.conclusion || 'unknown'} 상태로 완료`
}

// ★ 현재 workflow 전체의 진행 단계 판별
function determineCurrentPhase(jobs: workflowJob[]): string | null {
  const inProgressJob = jobs.find((j) => j.status === 'in_progress')
  if (inProgressJob) {
    const activeStep = inProgressJob.steps.find((s) => s.status === 'in_progress')
    if (activeStep) {
      const matched = STEP_PATTERNS.find((p) => p.test(activeStep.name))
      return matched ? `${inProgressJob.name} — ${matched.summary}` : `${inProgressJob.name} — ${activeStep.name}`
    }
    return `${inProgressJob.name} 실행중`
  }

  const allSuccess = jobs.every((j) => j.conclusion === 'success')
  if (allSuccess) return '모든 작업 완료 ✅'

  const failedJobs = jobs.filter((j) => j.conclusion === 'failure')
  if (failedJobs.length > 0) return `${failedJobs.map((j) => j.name).join(', ')} 실패 ❌`
  return '완료'
}

// ★ 엔트리포인트 — GET /api/github/runs/:runId/summary 에서 호출
export async function generateRunSummary(runId: number): Promise<RunSummaryResponse> {
  const jobs = await getworkflowRunJobs(runId)

  const jobSummaries: JobSummary[] = jobs.map((job) => ({
    jobId: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    summary: summarizeJob(job),
    durationSeconds: computeDuration(job.startedAt, job.completedAt),
    steps: job.steps.map((step) => ({
      name: step.name,
      number: step.number,
      status: step.status,
      conclusion: step.conclusion,
      summary: summarizeStep(step),
      durationSeconds: computeDuration(step.startedAt, step.completedAt),
    })),
  }))

  return {
    runId,
    jobs: jobSummaries,
    overallSummary: buildOverallSummary(jobs),
    currentPhase: determineCurrentPhase(jobs),
  }
}
```

---

### 6-2. `callLlmAnalysis()` — LLM 에러 분석 (백엔드)

> 경로: `controlplane/api/src/fix/suggest.ts` 에 추가된 함수

```typescript
// ★ 실패한 workflow의 원시 로그를 LLM에 보내 한국어 에러 분석을 받는 함수
async function callLlmAnalysis(logText: string, ruleBasedSummary: string): Promise<string | null> {
  if (!env.llmApiKey) return null  // API 키 없으면 건너뜀

  // 로그가 너무 길면 마지막 12,000자만 사용 (에러는 보통 끝부분에 있음)
  const truncatedLog = logText.length > 12000 ? logText.slice(-12000) : logText

  const systemPrompt = `You are a DevOps expert analyzing GitHub Actions workflow failure logs.
Respond ONLY in Korean. Be concise but thorough.
Format your response as:
## 에러 원인
(1-2 sentences explaining the root cause)
## 해결 방안
(numbered list of concrete steps to fix)
## 영향 범위
(brief impact assessment)`

  const userPrompt = `Rule-based 사전 분석: ${ruleBasedSummary}

아래는 실패한 GitHub Actions workflow의 원시 로그입니다. 에러 원인과 해결 방안을 분석해주세요.

\`\`\`
${truncatedLog}
\`\`\``

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.llmApiKey}`,
      },
      body: JSON.stringify({
        model: env.llmModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      console.error(`LLM API error: HTTP ${response.status}`)
      return null
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content || null
  } catch (error) {
    console.error('LLM API call failed:', error instanceof Error ? error.message : error)
    return null  // 실패해도 rule-based 결과는 정상 반환
  }
}

// ★ generateFixSuggestion()에서 LLM 호출하는 핵심 로직
export async function generateFixSuggestion(runId: string): Promise<FixSuggestionResponse> {
  // ... (기존 코드: 로그 가져오기, rule-based 매칭)

  const draft = matchSuggestionRule(joinedLogText, jobs)
  const ruleMessage = buildMessage(draft)

  // ★ 실패한 Job이 있을 때만 LLM 호출
  const hasFailure = jobs.some((job) => job.conclusion === 'failure')
  const llmAnalysis = hasFailure ? await callLlmAnalysis(joinedLogText, ruleMessage) : null

  return {
    // ... (기존 rule-based 필드들)
    mode: llmAnalysis ? 'hybrid' : 'rule-based',  // ★ hybrid면 LLM 결과 포함
    llmAnalysis: llmAnalysis || undefined,          // ★ LLM 분석 결과 추가
  }
}
```

---

### 6-3. `PipelineGraph.tsx` — PIPELINE 그래프 (프론트엔드)

> 경로: `controlplane/web/src/components/pipeline/PipelineGraph.tsx`

```tsx
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Clock, Circle, SkipForward } from 'lucide-react'

// ★ Job들을 시간 순으로 정렬 후, 5초 이내 시작 Job은 병렬로 그룹핑
function groupJobsByExecution(jobs: PipelineJob[]): JobGroup[] {
  if (jobs.length === 0) return []

  const sorted = [...jobs].sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0
    if (!a.startedAt) return 1
    if (!b.startedAt) return -1
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  })

  const groups: JobGroup[] = []
  let currentGroup: PipelineJob[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = currentGroup[0]
    const curr = sorted[i]

    if (prev.startedAt && curr.startedAt) {
      const timeDiff = Math.abs(
        new Date(curr.startedAt).getTime() - new Date(prev.startedAt).getTime(),
      )
      // ★ 5초 이내 시작 = 같은 그룹(병렬) → 세로 배치
      if (timeDiff < 5000) {
        currentGroup.push(curr)
        continue
      }
    }

    groups.push({ jobs: currentGroup })
    currentGroup = [curr]
  }

  groups.push({ jobs: currentGroup })
  return groups
}

// ★ 상태별 아이콘 (성공=초록, 실패=빨간, 진행중=파란+pulse)
function getJobStatusIcon(status: string, conclusion: string | null) {
  if (status !== 'completed') return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
  if (conclusion === 'success') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (conclusion === 'failure') return <XCircle className="h-4 w-4 text-red-500" />
  if (conclusion === 'skipped') return <SkipForward className="h-4 w-4 text-gray-400" />
  return <Circle className="h-4 w-4 text-gray-400" />
}

// ★ 메인 컴포넌트 — 가로 스크롤 가능한 PIPELINE 그래프
export default function PipelineGraph({ jobs, activeJobId, onJobClick }: PipelineGraphProps) {
  const groups = groupJobsByExecution(jobs)

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        PIPELINE
      </p>
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className="flex items-center gap-0">
            {/* ★ 그룹 사이 화살표 커넥터 */}
            {groupIndex > 0 && (
              <div className="flex items-center px-1">
                <div className={cn('h-0.5 w-8 rounded-full', getConnectorColor(...))} />
                <div className={cn('... border-l-[6px] ...', /* 화살표 삼각형 */)} />
              </div>
            )}

            {/* ★ 병렬 Job이면 세로 배치, 아니면 가로 */}
            <div className={cn('flex', group.jobs.length > 1 ? 'flex-col gap-2' : '')}>
              {group.jobs.map((job) => (
                <button key={job.id} onClick={() => onJobClick(job.id)} className={cn(
                  'flex items-center gap-2 rounded-xl border-2 px-4 py-2.5',
                  getJobBorderColor(job.status, job.conclusion, isActive),
                  getJobBgColor(job.status, job.conclusion, isActive),
                )}>
                  {getJobStatusIcon(job.status, job.conclusion)}
                  <span>{job.name}</span>
                  <span className="text-xs text-gray-400">{duration}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

### 6-4. `StepTimeline.tsx` — Step 타임라인 (프론트엔드)

> 경로: `controlplane/web/src/components/pipeline/StepTimeline.tsx`

```tsx
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Clock, SkipForward, Circle } from 'lucide-react'

interface StepInfo {
  name: string
  number: number
  status: string
  conclusion: string | null
  summary?: string              // ★ Rule-based 한국어 요약
  durationSeconds?: number | null
  startedAt?: string | null
  completedAt?: string | null
}

export default function StepTimeline({ steps }: { steps: StepInfo[] }) {
  // ★ "Set up job", "Complete job", "Post ..." 같은 래퍼 Step 필터링
  const meaningful = steps.filter(
    (s) => !/^(Set up job|Complete job|Post .*)$/i.test(s.name),
  )
  const displaySteps = meaningful.length > 0 ? meaningful : steps

  return (
    <div className="px-4 py-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        단계별 진행
      </p>
      <div className="relative">
        {displaySteps.map((step, index) => (
          <div key={`step-${step.number}`} className="flex gap-3">
            {/* ★ 세로 타임라인 라인 + 아이콘 */}
            <div className="flex flex-col items-center">
              <div className="flex h-7 items-center">
                {getStepIcon(step.status, step.conclusion)}
              </div>
              {index < displaySteps.length - 1 && (
                <div className={cn('w-0.5 flex-1 min-h-[16px]', getLineColor(step.status, step.conclusion))} />
              )}
            </div>

            {/* ★ Step 내용 카드 — 이름 + 한국어 요약 + 소요시간 */}
            <div className={cn('mb-2 flex-1 rounded-lg border px-3 py-2', getStepHighlight(step.status, step.conclusion))}>
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-sm font-medium', step.conclusion === 'failure' ? 'text-red-700' : 'text-gray-800')}>
                  {step.name}
                </span>
                {duration && <span className="text-xs text-gray-400">{duration}</span>}
              </div>
              {/* ★ 한국어 요약 표시 */}
              {step.summary && (
                <p className={cn('mt-1 text-xs', step.conclusion === 'failure' ? 'text-red-600' : 'text-gray-500')}>
                  {step.summary}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

### 6-5. `github.ts` — API 라우트 등록 (백엔드)

> 경로: `controlplane/api/src/routes/github.ts`에 추가된 부분

```typescript
import { generateRunSummary } from '../fix/summarize.js'

// ★ Step 요약 API 엔드포인트
githubRouter.get('/api/github/runs/:runId/summary', async (req, res, next) => {
  try {
    const runId = Number(req.params.runId)
    if (Number.isNaN(runId)) {
      res.status(400).json({ error: 'runId must be a number' })
      return
    }

    const summary = await generateRunSummary(runId)
    res.json(summary)
  } catch (error) {
    next(error)
  }
})
```
