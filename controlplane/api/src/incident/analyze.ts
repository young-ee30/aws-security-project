import { callConfiguredLlm, resolveProvider } from '../llm/client.js'

type IncidentAiPage = 'gwanje' | 'hae'
type IncidentSeverity = 'info' | 'low' | 'medium' | 'high' | 'warn' | 'error'

interface IncidentSummaryCardInput {
  title: string
  value: string
  sub?: string
  source?: string
}

interface IncidentLogLineInput {
  time?: string
  text: string
  severity?: IncidentSeverity
  source?: string
}

export interface IncidentAnalyzeRequest {
  page: IncidentAiPage
  title?: string
  context?: string
  lastUpdated?: string
  summaryCards: IncidentSummaryCardInput[]
  logLines: IncidentLogLineInput[]
}

export interface IncidentAnalyzeResponse {
  ok: true
  provider: 'gemini' | 'fallback'
  page: IncidentAiPage
  title: string
  overview: string
  keyFindings: string[]
  risks: string[]
  recommendedActions: string[]
  evidence: string[]
}

interface NormalizedIncidentAnalysisResult {
  overview: string
  key_findings: string[]
  risks: string[]
  recommended_actions: string[]
  evidence: string[]
}

function createHttpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback
}

function normalizeStringArray(value: unknown, limit = 6) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
}

function normalizePage(value: unknown): IncidentAiPage | null {
  if (value === 'gwanje' || value === 'hae') {
    return value
  }

  return null
}

function normalizeSummaryCard(value: unknown): IncidentSummaryCardInput | null {
  if (!isPlainObject(value)) {
    return null
  }

  const title = normalizeString(value.title)
  const valueText = normalizeString(value.value)
  if (!title || !valueText) {
    return null
  }

  return {
    title,
    value: valueText,
    sub: normalizeString(value.sub) || undefined,
    source: normalizeString(value.source) || undefined,
  }
}

function normalizeSeverity(value: unknown): IncidentSeverity | undefined {
  if (
    value === 'info' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'warn' ||
    value === 'error'
  ) {
    return value
  }

  return undefined
}

function normalizeLogLine(value: unknown): IncidentLogLineInput | null {
  if (!isPlainObject(value)) {
    return null
  }

  const text = normalizeString(value.text)
  if (!text) {
    return null
  }

  return {
    time: normalizeString(value.time) || undefined,
    text,
    severity: normalizeSeverity(value.severity),
    source: normalizeString(value.source) || undefined,
  }
}

function normalizeIncidentAnalyzeRequest(input: IncidentAnalyzeRequest): IncidentAnalyzeRequest {
  const page = normalizePage(input.page)
  if (!page) {
    throw createHttpError(400, 'page must be "gwanje" or "hae"')
  }

  const summaryCards = Array.isArray(input.summaryCards)
    ? input.summaryCards.map(normalizeSummaryCard).filter((item): item is IncidentSummaryCardInput => !!item).slice(0, 16)
    : []
  const logLines = Array.isArray(input.logLines)
    ? input.logLines.map(normalizeLogLine).filter((item): item is IncidentLogLineInput => !!item).slice(0, 80)
    : []

  if (summaryCards.length === 0 && logLines.length === 0) {
    throw createHttpError(400, 'summaryCards or logLines must contain at least one item')
  }

  return {
    page,
    title: normalizeString(input.title) || (page === 'gwanje' ? '관제 전체 로그 요약' : '침해 전체 로그 요약'),
    context: normalizeString(input.context) || undefined,
    lastUpdated: normalizeString(input.lastUpdated) || undefined,
    summaryCards,
    logLines,
  }
}

function compactRequest(input: IncidentAnalyzeRequest) {
  return {
    page: input.page,
    title: input.title,
    context: input.context,
    lastUpdated: input.lastUpdated,
    summaryCards: input.summaryCards,
    logLines: input.logLines,
  }
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim()

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenceMatch?.[1]) {
      try {
        return JSON.parse(fenceMatch[1]) as unknown
      } catch {
        // continue
      }
    }

    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown
      } catch {
        return null
      }
    }

    return null
  }
}

function normalizeAnalysisResult(value: unknown): NormalizedIncidentAnalysisResult | null {
  if (!isPlainObject(value)) {
    return null
  }

  const overview = normalizeString(value.overview)
  const keyFindings = normalizeStringArray(value.key_findings, 8)
  const risks = normalizeStringArray(value.risks, 8)
  const recommendedActions = normalizeStringArray(value.recommended_actions, 8)
  const evidence = normalizeStringArray(value.evidence, 8)

  if (!overview) {
    return null
  }

  return {
    overview,
    key_findings: keyFindings,
    risks,
    recommended_actions: recommendedActions,
    evidence,
  }
}

function severityWeight(level?: IncidentSeverity) {
  switch (level) {
    case 'error':
      return 5
    case 'high':
      return 4
    case 'warn':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

function formatEvidenceLine(log: IncidentLogLineInput) {
  const prefix = [log.time, log.source].filter(Boolean).join(' | ')
  return prefix ? `${prefix} | ${log.text}` : log.text
}

function buildFallbackIncidentAnalysis(input: IncidentAnalyzeRequest): IncidentAnalyzeResponse {
  const errorCount = input.logLines.filter((log) => log.severity === 'error' || log.severity === 'high').length
  const warnCount = input.logLines.filter((log) => log.severity === 'warn' || log.severity === 'medium').length
  const sourceCounts = new Map<string, number>()
  for (const log of input.logLines) {
    const key = log.source || 'unknown'
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1)
  }

  const sourceSummary =
    [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([source, count]) => `${source} ${count}건`)
      .join(', ') || '수집 소스 정보 없음'

  const headlineCards = input.summaryCards
    .slice(0, 4)
    .map((card) => `${card.title}: ${card.value}${card.sub ? ` (${card.sub})` : ''}`)

  const criticalEvidence = [...input.logLines]
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 5)
    .map(formatEvidenceLine)

  const pageLabel = input.page === 'gwanje' ? '관제' : '침해'
  const risks =
    errorCount > 0
      ? [
          `고심각도 또는 에러 성격 로그가 ${errorCount}건 있어 우선 원인 확인이 필요합니다.`,
          input.page === 'hae'
            ? '권한 변경, 인증 실패, 보안 탐지 계열 이벤트가 실제 침해 징후인지 확인해야 합니다.'
            : '서비스 지연, 5xx, ALB 또는 애플리케이션 경고가 실제 장애 전조인지 확인해야 합니다.',
        ]
      : warnCount > 0
        ? [`중간 이상 경고 로그가 ${warnCount}건 있어 추세 악화 여부를 계속 확인해야 합니다.`]
        : ['즉시 치명적으로 보이는 이벤트는 적지만, 추세 기반 이상 징후 여부는 계속 확인해야 합니다.']

  const recommendedActions =
    input.page === 'hae'
      ? [
          '고심각도 CloudTrail, GuardDuty, WAF 이벤트를 시간순으로 재검토합니다.',
          '권한 변경이나 비정상 인증 이벤트가 실제 운영 작업인지 변경 이력과 대조합니다.',
          '반복 IP, 사용자, 리소스가 보이면 차단 또는 추가 모니터링 대상을 지정합니다.',
        ]
      : [
          '에러 및 경고 로그가 집중된 서비스와 시간대를 먼저 확인합니다.',
          'ALB, ECS, RDS, Prometheus 지표를 함께 비교해 병목 위치를 좁힙니다.',
          '응답 시간, 5xx, 리소스 사용률이 같이 치솟는 구간이 있으면 해당 배포나 설정 변경을 점검합니다.',
        ]

  return {
    ok: true,
    provider: 'fallback',
    page: input.page,
    title: input.title || `${pageLabel} AI 요약`,
    overview: `${pageLabel} 페이지 기준 요약 카드 ${input.summaryCards.length}개와 로그 ${input.logLines.length}건을 분석했습니다. 소스 분포는 ${sourceSummary}이며, 고심각도/에러 ${errorCount}건, 경고 ${warnCount}건이 확인됐습니다.`,
    keyFindings:
      headlineCards.length > 0
        ? headlineCards
        : ['수집된 요약 카드가 적어 로그 중심으로만 판단했습니다.'],
    risks,
    recommendedActions,
    evidence:
      criticalEvidence.length > 0
        ? criticalEvidence
        : input.logLines.slice(0, 5).map(formatEvidenceLine),
  }
}

function buildSystemPrompt() {
  return [
    'You are a senior SOC analyst and SRE summarizing operational or incident logs for a dashboard user.',
    'Stay strictly grounded in the provided summary cards and log lines.',
    'Do not invent systems, incidents, root causes, or mitigations that are not supported by the input.',
    'Summarize the whole page, not one single event.',
    'Write concise Korean for operators.',
    'Return valid JSON only with exactly this schema:',
    '{',
    '  "overview": "string",',
    '  "key_findings": ["string"],',
    '  "risks": ["string"],',
    '  "recommended_actions": ["string"],',
    '  "evidence": ["string"]',
    '}',
    'Rules:',
    '- key_findings should be 3 to 5 items.',
    '- risks should be 2 to 4 items.',
    '- recommended_actions should be 3 items.',
    '- evidence should reference concrete log lines or summary cards from the input.',
    '- If the data looks stable, say so instead of exaggerating.',
  ].join('\n')
}

function buildUserPrompt(input: IncidentAnalyzeRequest) {
  return [
    'Analyze the following incident/monitoring page payload and summarize the whole log context.',
    '',
    '[PAYLOAD]',
    JSON.stringify(compactRequest(input), null, 2),
  ].join('\n')
}

export async function analyzeIncidentLogs(rawInput: IncidentAnalyzeRequest): Promise<IncidentAnalyzeResponse> {
  const input = normalizeIncidentAnalyzeRequest(rawInput)
  const fallback = buildFallbackIncidentAnalysis(input)

  const llmResponse = await callConfiguredLlm({
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    responseMimeType: 'application/json',
    temperature: 0.2,
    maxTokens: 1200,
  })

  if (!llmResponse?.content) {
    return fallback
  }

  const parsed = extractJsonObject(llmResponse.content)
  const normalized = normalizeAnalysisResult(parsed)
  if (!normalized) {
    return fallback
  }

  return {
    ok: true,
    provider: resolveProvider(),
    page: input.page,
    title: input.title || fallback.title,
    overview: normalized.overview,
    keyFindings: normalized.key_findings.length > 0 ? normalized.key_findings : fallback.keyFindings,
    risks: normalized.risks.length > 0 ? normalized.risks : fallback.risks,
    recommendedActions:
      normalized.recommended_actions.length > 0 ? normalized.recommended_actions : fallback.recommendedActions,
    evidence: normalized.evidence.length > 0 ? normalized.evidence : fallback.evidence,
  }
}
