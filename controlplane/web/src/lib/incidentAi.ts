import { API_BASE_URL } from '@/lib/env'

export type IncidentAiPage = 'gwanje' | 'hae'
export type IncidentAiSeverity = 'info' | 'low' | 'medium' | 'high' | 'warn' | 'error'

export interface IncidentAiSummaryCard {
  title: string
  value: string
  sub?: string
  source?: string
}

export interface IncidentAiLogLine {
  time?: string
  text: string
  severity?: IncidentAiSeverity
  source?: string
}

export interface IncidentAiAnalysisRequest {
  page: IncidentAiPage
  title: string
  context?: string
  lastUpdated?: string
  summaryCards: IncidentAiSummaryCard[]
  logLines: IncidentAiLogLine[]
}

export interface IncidentAiAnalysisResponse {
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

export async function requestIncidentAiAnalysis(
  input: IncidentAiAnalysisRequest,
): Promise<IncidentAiAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/api/incidents/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || `AI 분석 요청에 실패했습니다. (${response.status})`)
  }

  return (await response.json()) as IncidentAiAnalysisResponse
}
