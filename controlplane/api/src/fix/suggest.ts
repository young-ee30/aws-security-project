import { env } from '../config/env.js'
import { getWorkflowRunJobs, getWorkflowRunLogs, getFileContent } from '../github/actions.js'
import { callConfiguredLlm } from '../llm/client.js'

type WorkflowJob = Awaited<ReturnType<typeof getWorkflowRunJobs>>[number]
type WorkflowJobLog = Awaited<ReturnType<typeof getWorkflowRunLogs>>['logs'][number]
type RiskLevel = 'low' | 'medium' | 'high'
type LlmStatus = 'not_attempted' | 'success' | 'failed'
type AnalysisKind = 'failure' | 'informational'

interface CandidateFile {
  path: string
  reason: string
}

interface SuggestionDraft {
  analysisKind?: AnalysisKind
  ruleId: string
  title: string
  summary: string
  rootCause: string
  riskLevel: RiskLevel
  nextActions: string[]
  candidateFiles: CandidateFile[]
  patchIdea?: string
}

interface SuggestedFile {
  path: string
  content: string
}

interface AnnotationSummaryInput {
  title: string | null
  message: string | null
  path: string | null
  count: number | null
}

interface GenerateFixSuggestionOptions {
  jobId?: number
  jobName?: string
  stepName?: string
  stepNumber?: number
  stepStatus?: string
  stepConclusion?: string
  stepLog?: string
  annotations?: AnnotationSummaryInput[]
}

export interface FixSuggestionResponse {
  ok: true
  runId: string
  message: string
  analysisKind: AnalysisKind
  mode: 'rule-based' | 'llm' | 'hybrid'
  configuredModel?: string
  llmStatus: LlmStatus
  llmError?: string
  summary: string
  rootCause: string
  riskLevel: RiskLevel
  nextActions: string[]
  candidateFiles: CandidateFile[]
  patchIdea?: string
  matchedRules: string[]
  relatedJobs: Array<{
    jobId: number
    name: string
    failedSteps: string[]
  }>
  llmAnalysis?: string
  suggestedFiles?: SuggestedFile[]
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function normalizeText(text: string): string {
  return stripAnsi(text).replace(/\r/g, '')
}

function uniqueByPath(items: CandidateFile[]): CandidateFile[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.path)) {
      return false
    }
    seen.add(item.path)
    return true
  })
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function normalizeAnnotationInputs(annotations?: AnnotationSummaryInput[]): AnnotationSummaryInput[] {
  if (!annotations) {
    return []
  }

  return annotations.filter((annotation) => annotation.title || annotation.message)
}

function buildMessage(draft: SuggestionDraft): string {
  const parts = [
    `[${draft.title}]`,
    draft.summary,
    `원인: ${draft.rootCause}`,
    `위험도: ${draft.riskLevel}`,
  ]

  if (draft.nextActions.length > 0) {
    parts.push(`다음 조치: ${draft.nextActions.join(' / ')}`)
  }

  return parts.join('\n')
}

function buildSuggestionMessage(draft: SuggestionDraft, analysisKind: AnalysisKind): string {
  const parts = [`[${draft.title}]`, draft.summary]

  if (analysisKind === 'informational') {
    parts.push(`설명: ${draft.rootCause}`)

    if (draft.nextActions.length > 0) {
      parts.push(`확인 포인트: ${draft.nextActions.join(' / ')}`)
    }

    return parts.join('\n')
  }

  parts.push(`원인: ${draft.rootCause}`, `위험도: ${draft.riskLevel}`)

  if (draft.nextActions.length > 0) {
    parts.push(`다음 조치: ${draft.nextActions.join(' / ')}`)
  }

  return parts.join('\n')
}

function collectFailedSteps(job: WorkflowJob): string[] {
  return job.steps
    .filter((step) => step.conclusion === 'failure' || step.status !== 'completed')
    .map((step) => step.name)
}

function buildRelatedJobs(jobs: WorkflowJob[]) {
  return jobs
    .filter((job) => job.conclusion !== 'success')
    .map((job) => ({
      jobId: job.id,
      name: job.name,
      failedSteps: collectFailedSteps(job),
    }))
}

function detectWorkflowFiles(logText: string, jobs: WorkflowJob[]): CandidateFile[] {
  const files: CandidateFile[] = []

  if (logText.includes('Terraform Dev Plan and Apply') || jobs.some((job) => job.name.includes('Terraform'))) {
    files.push({
      path: '.github/workflows/terraform-dev-plan-apply.yml',
      reason: 'Terraform plan/apply와 import 보정 로직이 들어 있는 workflow입니다.',
    })
  }

  if (logText.includes('Bootstrap Terraform State') || logText.includes('state bucket')) {
    files.push({
      path: '.github/workflows/bootstrap-terraform-state.yml',
      reason: 'Terraform state bucket 초기화와 관련된 workflow입니다.',
    })
  }

  if (
    logText.includes('Deploy Selected Services to ECS') ||
    jobs.some((job) => job.name.includes('Deploy') || job.name.includes('ECS'))
  ) {
    files.push({
      path: '.github/workflows/ex-ecs-deploy.yml',
      reason: 'ECS 배포와 workflow_dispatch 입력을 관리하는 workflow입니다.',
    })
  }

  const explicitWorkflowPath = logText.match(/\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml/g)
  if (explicitWorkflowPath) {
    for (const path of explicitWorkflowPath) {
      files.push({
        path,
        reason: '로그에 직접 언급된 workflow 파일입니다.',
      })
    }
  }

  return uniqueByPath(files)
}

function normalizeCandidatePath(rawPath: string): string | null {
  const normalized = rawPath.trim().replace(/^['"`]+|['"`]+$/g, '').replace(/\\/g, '/').replace(/^\/+/, '')
  return normalized.length > 0 ? normalized : null
}

function detectCandidateFilesFromStepLog(logText: string): CandidateFile[] {
  const files: CandidateFile[] = []
  const explicitFilePatterns = [
    /(?:^|\s)File:\s+([^\s:]+\.tf(?:vars)?)(?::\d+(?:-\d+)?)?/gim,
    /(?:^|\s)Calling File:\s+([^\s:]+\.tf(?:vars)?)(?::\d+(?:-\d+)?)?/gim,
    /([A-Za-z0-9_./-]+\.tf(?:vars)?)/g,
    /(\.github\/workflows\/[A-Za-z0-9_./-]+\.ya?ml)/g,
  ]

  for (const pattern of explicitFilePatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(logText)) !== null) {
      const path = normalizeCandidatePath(match[1] || '')
      if (!path) {
        continue
      }

      files.push({
        path,
        reason: '선택한 step 로그에서 직접 언급된 파일입니다.',
      })
    }
  }

  return uniqueByPath(files)
}

function buildCheckovAnnotationDraft(
  jobName: string | undefined,
  annotations: AnnotationSummaryInput[],
): SuggestionDraft {
  const candidateFiles = uniqueByPath(
    annotations
      .filter((annotation) => typeof annotation.path === 'string' && annotation.path.trim().length > 0)
      .map((annotation) => ({
        path: annotation.path!.trim(),
        reason: 'Checkov 점검에서 직접 지목된 Terraform 파일입니다.',
      })),
  )

  return {
    ruleId: 'checkov-annotations',
    title: 'Checkov 보안 정책 점검',
    summary: `${jobName || 'Terraform Plan & Security Scan'}에서 보안 정책 ${annotations.length}개가 기준을 통과하지 못했습니다.`,
    rootCause: 'Terraform 리소스 설정 일부가 Checkov와 AWS 보안 기준을 만족하지 않아 암호화, 네트워크 노출, 로깅, 삭제 보호 같은 항목에서 실패했습니다.',
    riskLevel: 'medium',
    nextActions: [
      '공개 노출, 암호화, 로깅 누락처럼 영향이 큰 항목부터 우선 수정합니다.',
      'Annotations에 나온 Terraform 파일과 모듈 설정을 보강한 뒤 다시 plan을 실행합니다.',
      '예외로 둘 항목은 skip 처리 전에 설계로 완화할 수 있는지 먼저 검토합니다.',
    ],
    candidateFiles,
    patchIdea: 'Annotations에 나온 Terraform 파일을 중심으로 보안 설정을 보완하고 다시 Checkov를 실행합니다.',
  }
}

function buildStepExplanationDraft(
  jobName: string | undefined,
  stepName: string | undefined,
  logText: string,
  jobs: WorkflowJob[],
): SuggestionDraft {
  return {
    ruleId: 'workflow-step-explanation',
    title: '선택 단계 설명',
    summary: `${jobName || '선택한 job'}의 ${stepName || '선택한 단계'}는 실패 원인 분석이 아니라 단계 설명 모드로 분류했습니다.`,
    rootCause: '이 단계가 무엇을 하는지, 로그에서 어떤 작업이 수행됐는지, 다음 단계와 어떻게 이어지는지만 설명합니다.',
    riskLevel: 'low',
    nextActions: [
      '로그에 나온 명령과 설정 작업을 기준으로 단계의 역할을 확인합니다.',
      '이 단계 다음에 이어지는 step과 입력값, 산출물을 함께 봅니다.',
    ],
    candidateFiles: uniqueByPath([
      ...detectCandidateFilesFromStepLog(logText),
      ...detectWorkflowFiles(logText, jobs),
    ]),
  }
}

function matchSuggestionRule(logText: string, jobs: WorkflowJob[]): SuggestionDraft {
  const workflowFiles = detectWorkflowFiles(logText, jobs)

  if (
    /resource already managed by terraform/i.test(logText) ||
    /must first remove the existing object from the state/i.test(logText)
  ) {
    return {
      ruleId: 'terraform-resource-already-managed',
      title: 'Terraform import 재시도 충돌',
      summary: 'apply 전에 orphan 리소스를 import하는 단계가 이미 state에 있는 리소스를 다시 import하고 있습니다.',
      rootCause: 'workflow import 단계가 idempotent하지 않아 같은 IAM role 또는 target group을 재실행 시 다시 import하려고 합니다.',
      riskLevel: 'medium',
      nextActions: [
        'import 전에 terraform state show 로 state 존재 여부를 확인합니다.',
        'terraform import 결과가 already managed 면 실패 대신 skip 처리합니다.',
        '수정 후 Terraform Dev Plan and Apply workflow 를 다시 실행합니다.',
      ],
      candidateFiles: uniqueByPath([
        {
          path: '.github/workflows/terraform-dev-plan-apply.yml',
          reason: 'IAM role, log group, target group import 보정 로직이 들어 있습니다.',
        },
        ...workflowFiles,
      ]),
      patchIdea: 'terraform import 를 바로 실행하지 말고 terraform state show 와 already managed 메시지 처리를 추가합니다.',
    }
  }

  if (/TF_VAR_DB_PASSWORD repository secret is not set/i.test(logText)) {
    return {
      ruleId: 'terraform-secret-missing',
      title: 'Terraform secret 누락',
      summary: 'workflow 에 필요한 TF_VAR_db_password 값이 GitHub Actions secret 에 없습니다.',
      rootCause: 'Terraform workflow 가 repository secret TF_VAR_DB_PASSWORD 를 요구하지만 현재 저장소에 값이 등록되지 않았습니다.',
      riskLevel: 'high',
      nextActions: [
        'GitHub repository secret TF_VAR_DB_PASSWORD 를 추가합니다.',
        'secret 이름 대소문자와 repository 범위를 다시 확인합니다.',
        'secret 추가 후 Terraform workflow 를 rerun 합니다.',
      ],
      candidateFiles: uniqueByPath([
        {
          path: '.github/workflows/terraform-dev-plan-apply.yml',
          reason: 'TF_VAR_DB_PASSWORD 존재 여부를 체크하는 workflow입니다.',
        },
        ...workflowFiles,
      ]),
    }
  }

  if (/No Terraform state bucket found/i.test(logText) || /set TF_STATE_BUCKET manually/i.test(logText)) {
    return {
      ruleId: 'terraform-state-bucket-missing',
      title: 'Terraform state bucket 미준비',
      summary: 'Terraform backend 가 사용할 S3 state bucket 을 찾지 못했습니다.',
      rootCause: 'bootstrap workflow 가 아직 실행되지 않았거나 TF_STATE_BUCKET repository variable 이 비어 있습니다.',
      riskLevel: 'high',
      nextActions: [
        'Bootstrap Terraform State workflow 를 먼저 실행합니다.',
        '필요하면 GitHub repository variable TF_STATE_BUCKET 을 직접 설정합니다.',
        'state bucket 생성 후 Terraform workflow 를 다시 실행합니다.',
      ],
      candidateFiles: uniqueByPath([
        {
          path: '.github/workflows/bootstrap-terraform-state.yml',
          reason: 'state bucket 생성 또는 재사용 로직이 있습니다.',
        },
        {
          path: '.github/workflows/terraform-dev-plan-apply.yml',
          reason: 'state bucket 조회 실패가 발생한 workflow입니다.',
        },
        ...workflowFiles,
      ]),
    }
  }

  if (
    /not authorized to perform: sts:AssumeRole/i.test(logText) ||
    /could not assume role/i.test(logText) ||
    /AccessDenied/i.test(logText) && /AssumeRole/i.test(logText)
  ) {
    return {
      ruleId: 'aws-role-assume-failed',
      title: 'AWS OIDC role assume 실패',
      summary: 'GitHub Actions 가 AWS IAM role 을 AssumeRole 하지 못했습니다.',
      rootCause: 'AWS_TERRAFORM_ROLE_ARN 값이 잘못됐거나 IAM trust policy 에 GitHub OIDC 조건이 맞지 않습니다.',
      riskLevel: 'high',
      nextActions: [
        'AWS_TERRAFORM_ROLE_ARN secret 값이 올바른지 확인합니다.',
        'IAM role trust policy 에 GitHub OIDC provider 와 repo 조건이 맞는지 점검합니다.',
        '권한 수정 후 workflow 를 다시 실행합니다.',
      ],
      candidateFiles: uniqueByPath([
        {
          path: '.github/workflows/bootstrap-terraform-state.yml',
          reason: 'AWS credentials 설정이 포함된 workflow입니다.',
        },
        {
          path: '.github/workflows/terraform-dev-plan-apply.yml',
          reason: 'Terraform plan/apply 에서 AWS credentials 를 설정합니다.',
        },
        {
          path: '.github/workflows/ex-ecs-deploy.yml',
          reason: 'ECS 배포 workflow 도 같은 AWS role 을 사용합니다.',
        },
        ...workflowFiles,
      ]),
    }
  }

  if (/workflow is not valid/i.test(logText) || /yaml/i.test(logText) && /error/i.test(logText)) {
    return {
      ruleId: 'workflow-yaml-invalid',
      title: 'GitHub Actions workflow 문법 오류',
      summary: 'workflow 파일의 YAML 또는 GitHub Actions 문법 오류로 실행이 실패했습니다.',
      rootCause: 'workflow 파일의 문법, 입력 타입, expression 또는 들여쓰기 중 하나가 잘못되었습니다.',
      riskLevel: 'medium',
      nextActions: [
        '로그에 언급된 workflow 파일의 해당 라인을 확인합니다.',
        'inputs, if 조건식, matrix, uses/with 들여쓰기를 다시 점검합니다.',
        '수정 후 workflow_dispatch 또는 push 로 다시 검증합니다.',
      ],
      candidateFiles: uniqueByPath(workflowFiles),
    }
  }

  return {
    ruleId: 'generic-failed-run',
    title: '일반 실패 로그 분석',
    summary: '실패 로그는 읽었지만 한 가지 규칙으로 단정하기 어려워서 수동 확인이 더 필요합니다.',
    rootCause: '현재 MVP 규칙에 정확히 맞는 패턴이 없거나 여러 원인이 동시에 섞여 있습니다.',
    riskLevel: 'medium',
    nextActions: [
      '실패한 첫 번째 step 이름과 직전 로그를 먼저 확인합니다.',
      '해당 job 과 연결된 workflow 파일을 열어 조건식과 입력값을 점검합니다.',
      '필요하면 이 로그 패턴을 새 규칙으로 추가해 자동 분류 범위를 넓힙니다.',
    ],
    candidateFiles: workflowFiles,
  }
}

async function fetchTerraformContext(candidateFiles: CandidateFile[]): Promise<string> {
  const tfFiles = candidateFiles
    .filter((f) => f.path.endsWith('.tf') || f.path.endsWith('.tfvars'))
    .slice(0, 3)

  if (tfFiles.length === 0) return ''

  const contents = await Promise.all(
    tfFiles.map(async (f) => {
      const content = await getFileContent(f.path)
      if (!content) return null
      const truncated = content.length > 3000 ? content.slice(0, 3000) + '\n... (truncated)' : content
      return `### ${f.path}\n\`\`\`hcl\n${truncated}\n\`\`\``
    }),
  )

  const valid = contents.filter(Boolean)
  if (valid.length === 0) return ''
  return `\n\n[관련 Terraform 코드]\n${valid.join('\n\n')}`
}

function parseSuggestedFiles(llmResponse: string): SuggestedFile[] {
  const files: SuggestedFile[] = []
  const codeBlockRegex = /(?:#+\s*.*?[`'"]?([\w/.-]+\.tf)[`'"]?.*?\n)?```(?:hcl|terraform)?\n([\s\S]*?)```/gi

  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(llmResponse)) !== null) {
    const pathFromHeader = match[1] || null
    const code = match[2]?.trim()
    if (!code) continue

    // 파일 경로를 코드 블록 위 헤더에서 찾거나, 코드 내 주석에서 추출
    let filePath = pathFromHeader
    if (!filePath) {
      const commentMatch = code.match(/^#\s*(?:file|path):\s*(.+\.tf)/im)
      filePath = commentMatch?.[1] || null
    }
    if (!filePath) {
      // 컨텍스트에서 .tf 파일 경로가 있으면 사용
      const pathInText = llmResponse.slice(Math.max(0, (match.index || 0) - 200), match.index || 0)
      const nearbyPath = pathInText.match(/([\w/.-]+\.tf)/)
      filePath = nearbyPath?.[1] || null
    }

    if (filePath && code.length > 10) {
      files.push({ path: filePath, content: code })
    }
  }

  return files
}

function buildLlmPromptSet(
  analysisKind: AnalysisKind,
  stepContext: string,
  ruleBasedSummary: string,
  annotationSummary: string,
  truncatedLog: string,
  terraformContext: string,
) {
  const prefix = `${stepContext}${stepContext ? '\n\n' : ''}Rule-based summary: ${ruleBasedSummary}`

  if (analysisKind === 'informational') {
    return {
      systemPrompt: `You are a senior DevOps engineer familiar with AWS, Terraform, and GitHub Actions.
Respond in Korean.
If the selected step is not failing, do not invent an error cause. Explain the step in a concise operational way.
Output format exactly:
[What]
- ...
[Observed]
- ...
[Next]
- ...
[Checkpoints]
- ...
Constraints:
- At most 2 bullets per section.
- Each bullet must be one short sentence.
- No introduction or conclusion.
- Do not use markdown headings like ###.
- Do not propose code changes unless clearly necessary.`,
      userPrompt: `${prefix}

${annotationSummary}

[Selected step log]
\`\`\`
${truncatedLog}
\`\`\`${terraformContext}`,
    }
  }

  return {
    systemPrompt: `You are a senior DevOps engineer familiar with AWS, Terraform, and GitHub Actions.
Respond in Korean.
Analyze the failure concisely.
Output format exactly:
[Cause]
- ...
[Impact]
- ...
[Next]
- ...
[Fix]
- ...
Constraints:
- At most 2 bullets per section.
- Each bullet must be one short sentence.
- No introduction or conclusion.
- Do not use markdown headings like ###.
- Only include code change guidance when the log clearly supports it.`,
    userPrompt: `${prefix}

${annotationSummary}

[Failure log]
\`\`\`
${truncatedLog}
\`\`\`${terraformContext}`,
  }
}

async function callLlmAnalysis(
  logText: string,
  ruleBasedSummary: string,
  annotationSummary: string,
  stepContext: string,
  terraformContext: string,
  analysisKind: AnalysisKind,
): Promise<{ analysis: string | null; suggestedFiles: SuggestedFile[]; error?: string }> {
  if (!env.llmApiKey) {
    return {
      analysis: null,
      suggestedFiles: [],
      error: 'Gemini is not configured. Set LLM_API_KEY or GEMINI_API_KEY.',
    }
  }

  const truncatedLog = logText.length > 12000 ? logText.slice(-12000) : logText
  const promptBundle = buildLlmPromptSet(
    analysisKind,
    stepContext,
    ruleBasedSummary,
    annotationSummary,
    truncatedLog,
    terraformContext,
  )

  const systemPrompt = `당신은 AWS 클라우드 아키텍처 및 Terraform 프로비저닝에 정통한 시니어 DevOps 엔지니어입니다.
현재 CI/CD PIPELINE(GitHub Actions)에서 Terraform 코드를 실행하던 중 에러가 발생했습니다.
선택된 step 정보가 주어지면 반드시 그 step이 하려던 작업, 실패 지점, 관련 workflow/Terraform 코드에 집중해서 분석하세요.

아래 제공된 [에러 로그]와 [관련 Terraform 코드]를 분석하여 다음 형식에 맞춰 답변해 주세요.

### 🚨 에러 원인 분석
(에러가 발생한 근본적인 원인을 2~3줄로 명확하고 알기 쉽게 요약해 주세요.)

### 💡 해결 방안
(에러를 해결하기 위한 구체적이고 단계적인 조치 사항을 번호 리스트로 설명해 주세요.)

### 🛠️ Terraform 코드 수정 제안
(Terraform 코드 수정이 필요한 경우, 수정할 파일 경로를 명시하고 전체 수정된 코드를 \`\`\`hcl 코드 블록으로 작성해 주세요. 코드 블록 바로 위에 파일 경로를 적어주세요.
수정이 필요 없다면 "코드 수정 불필요"라고 명시하고 그 이유를 적어주세요.)

중요: 코드 수정 제안 시 반드시 파일 경로를 코드 블록 위에 명시해 주세요.
예시:
#### \`terraform/modules/ecs/main.tf\`
\`\`\`hcl
# 수정된 전체 코드
\`\`\``

  const userPrompt = `${stepContext}${stepContext ? '\n\n' : ''}Rule-based 사전 분석: ${ruleBasedSummary}

${annotationSummary}

[에러 로그]
\`\`\`
${truncatedLog}
\`\`\`${terraformContext}`

  try {
    const response = await callConfiguredLlm({
      messages: [
        { role: 'system', content: promptBundle.systemPrompt },
        { role: 'user', content: promptBundle.userPrompt },
      ],
      maxTokens: 2000,
      temperature: 0.3,
    })

    if (!response?.content) {
      return {
        analysis: null,
        suggestedFiles: [],
        error: 'Gemini returned no usable content.',
      }
    }

    const content = response.content
    const suggestedFiles = analysisKind === 'failure' && content ? parseSuggestedFiles(content) : []

    return { analysis: content, suggestedFiles }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('LLM API call failed:', message)
    return { analysis: null, suggestedFiles: [], error: message }
  }
}

export async function generateFixSuggestion(
  runId: string,
  options?: GenerateFixSuggestionOptions,
): Promise<FixSuggestionResponse> {
  const parsedRunId = Number(runId)

  if (Number.isNaN(parsedRunId)) {
    throw new Error('runId must be a number')
  }

  const selectedStepLog = options?.stepLog ? normalizeText(options.stepLog) : ''
  const fallbackLogsResponse = {
    runId: parsedRunId,
    selectedJobIds: options?.jobId ? [options.jobId] : [],
    logs: [],
  }

  const [jobsResult, logsResult] = await Promise.allSettled([
    getWorkflowRunJobs(parsedRunId),
    selectedStepLog
      ? Promise.resolve(fallbackLogsResponse)
      : getWorkflowRunLogs(parsedRunId, options?.jobId),
  ])

  const jobs =
    jobsResult.status === 'fulfilled'
      ? jobsResult.value
      : []
  const logsResponse =
    logsResult.status === 'fulfilled'
      ? logsResult.value
      : fallbackLogsResponse

  if (jobsResult.status === 'rejected') {
    console.warn('Failed to fetch workflow jobs for fix suggestion; continuing with limited context.', jobsResult.reason)
  }

  if (logsResult.status === 'rejected') {
    console.warn('Failed to fetch workflow logs for fix suggestion; continuing with limited context.', logsResult.reason)
  }

  const normalizedLogs = logsResponse.logs.map((log) => ({
    ...log,
    content: normalizeText(log.content),
  }))

  const normalizedAnnotations = normalizeAnnotationInputs(options?.annotations)
  const selectedJob = options?.jobId != null
    ? jobs.find((job) => job.id === options.jobId)
    : undefined
  const selectedJobStep =
    selectedJob && options?.stepNumber != null
      ? selectedJob.steps.find((step) => step.number === options.stepNumber)
      : undefined
  const selectedStepConclusion = selectedJobStep?.conclusion || options?.stepConclusion || null
  const filteredLogs = options?.jobId
    ? normalizedLogs.filter((log) => log.jobId === options.jobId)
    : normalizedLogs
  const joinedLogText = selectedStepLog
    ? [
      `# ${options?.jobName || 'Selected job'} > ${options?.stepName || 'Selected step'}`,
      selectedStepLog,
    ].join('\n')
    : (filteredLogs.length > 0 ? filteredLogs : normalizedLogs)
      .map((log) => [`# ${log.name}`, log.content].join('\n'))
      .join('\n\n')

  const analysisKind: AnalysisKind =
    options?.stepName && normalizedAnnotations.length === 0 && selectedStepConclusion !== 'failure'
      ? 'informational'
      : 'failure'
  const draft =
    analysisKind === 'informational'
      ? buildStepExplanationDraft(options?.jobName, options?.stepName, joinedLogText, jobs)
      : normalizedAnnotations.length > 0
        ? buildCheckovAnnotationDraft(options?.jobName, normalizedAnnotations)
        : matchSuggestionRule(joinedLogText, jobs)
  draft.candidateFiles = uniqueByPath([
    ...detectCandidateFilesFromStepLog(selectedStepLog),
    ...draft.candidateFiles,
  ])
  const relatedJobs = options?.jobId
    ? jobs
      .filter((job) => job.id === options.jobId)
      .map((job) => ({
        jobId: job.id,
        name: job.name,
        failedSteps: collectFailedSteps(job),
      }))
    : buildRelatedJobs(jobs)
  const ruleMessage = buildSuggestionMessage(draft, analysisKind)
  const stepContext = options?.stepName
    ? [
      '[선택된 분석 대상]',
      `- Job: ${options.jobName || 'unknown'}`,
      `- Step: ${options.stepName}`,
      options.stepNumber != null ? `- Step number: ${options.stepNumber}` : null,
      options.stepStatus ? `- Step status: ${options.stepStatus}` : null,
      selectedStepConclusion ? `- Step conclusion: ${selectedStepConclusion}` : null,
    ]
      .filter((value): value is string => !!value)
      .join('\n')
    : ''

  const hasFailure = jobs.some((job) => job.conclusion === 'failure')
  const shouldAttemptLlm = hasFailure || normalizedAnnotations.length > 0 || selectedStepLog.length > 0
  const annotationSummaryText =
    normalizedAnnotations.length > 0
      ? [
        '[Checkov 실패 요약]',
        ...normalizedAnnotations.map((annotation) => {
          const title = annotation.title || 'Untitled check'
          const message = annotation.message || 'No message'
          const countText = annotation.count && annotation.count > 1 ? ` (${annotation.count}건)` : ''
          const pathText = annotation.path ? ` - ${annotation.path}` : ''
          return `- ${title}: ${message}${countText}${pathText}`
        }),
      ].join('\n')
      : ''

  let llmAnalysis: string | undefined
  let suggestedFiles: SuggestedFile[] | undefined
  let llmError: string | undefined

  if (shouldAttemptLlm) {
    const terraformContext = await fetchTerraformContext(draft.candidateFiles)
    const llmResult = await callLlmAnalysis(
      joinedLogText,
      ruleMessage,
      annotationSummaryText,
      stepContext,
      terraformContext,
      analysisKind,
    )
    llmAnalysis = llmResult.analysis || undefined
    suggestedFiles = llmResult.suggestedFiles.length > 0 ? llmResult.suggestedFiles : undefined
    llmError = llmResult.error || undefined
  }

  const llmStatus: LlmStatus = !shouldAttemptLlm ? 'not_attempted' : llmAnalysis ? 'success' : 'failed'

  return {
    ok: true,
    runId,
    message: ruleMessage,
    analysisKind,
    mode: llmAnalysis ? 'hybrid' : 'rule-based',
    configuredModel: env.llmModel,
    llmStatus,
    llmError,
    summary: draft.summary,
    rootCause: draft.rootCause,
    riskLevel: draft.riskLevel,
    nextActions: uniqueStrings(draft.nextActions),
    candidateFiles: uniqueByPath(draft.candidateFiles),
    patchIdea: draft.patchIdea,
    matchedRules: [draft.ruleId],
    relatedJobs: relatedJobs.length > 0
      ? relatedJobs
      : normalizedLogs.map((log) => ({
        jobId: log.jobId,
        name: log.name,
        failedSteps: [],
      })),
    llmAnalysis,
    suggestedFiles,
  }
}
