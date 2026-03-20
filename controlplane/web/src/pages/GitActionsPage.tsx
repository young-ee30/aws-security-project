import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  FileCode,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/Header'
import PipelineGraph from '@/components/pipeline/PipelineGraph'
import StepTimeline from '@/components/pipeline/StepTimeline'
import { cn } from '@/lib/utils'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:4000'
const POLLING_INTERVAL_MS = 15000
const NEW_RUN_POLL_ATTEMPTS = 10
const NEW_RUN_POLL_INTERVAL_MS = 1500
const FULL_PIPELINE_WORKFLOW_NAME = 'Bootstrap Terraform State'
const PIPELINE_WORKFLOW_NAMES = [
  'Bootstrap Terraform State',
  'Terraform Dev Plan and Apply',
  'Deploy Selected Services to ECS',
] as const

function getWorkflowDescription(workflowName: string): string {
  if (workflowName === 'Bootstrap Terraform State') {
    return 'state 파일 저장용 s3 버킷 확인'
  }

  if (workflowName === 'Terraform Dev Plan and Apply') {
    return 'terraform 보안 점검 및 인프라 배포 계획 설계'
  }

  if (workflowName === 'Deploy Selected Services to ECS') {
    return 'ECS에 도커 이미지 배포'
  }

  return 'workflow 요약'
}

interface WorkflowRun {
  id: number
  workflowId: number
  name: string
  displayTitle: string
  status: string
  conclusion: string | null
  event: string
  branch: string | null
  sha: string
  htmlUrl: string
  runNumber: number
  runAttempt: number
  actor: string | null
  createdAt: string
  updatedAt: string
}

interface WorkflowRunsResponse {
  runs: WorkflowRun[]
}

interface WorkflowStep {
  name: string
  status: string
  conclusion: string | null
  number: number
  startedAt: string | null
  completedAt: string | null
}

interface WorkflowJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  htmlUrl: string
  runnerName: string | null
  labels: string[]
  steps: WorkflowStep[]
}

interface WorkflowJobsResponse {
  runId: number
  jobs: WorkflowJob[]
}

interface WorkflowJobLog {
  jobId: number
  name: string
  status: string
  conclusion: string | null
  content: string
}

interface WorkflowLogsResponse {
  runId: number
  selectedJobIds: number[]
  logs: WorkflowJobLog[]
}

interface ApiErrorPayload {
  error?: string
  message?: string
}

interface SuggestResponse {
  ok: boolean
  runId: string
  message: string
  mode?: 'rule-based' | 'llm' | 'hybrid'
  configuredModel?: string
  summary?: string
  rootCause?: string
  riskLevel?: 'low' | 'medium' | 'high'
  nextActions?: string[]
  candidateFiles?: Array<{
    path: string
    reason: string
  }>
  patchIdea?: string
  matchedRules?: string[]
  relatedJobs?: Array<{
    jobId: number
    name: string
    failedSteps: string[]
  }>
  llmAnalysis?: string
  suggestedFiles?: Array<{
    path: string
    content: string
  }>
}

interface PrReview {
  number: number
  title: string
  state: string
  merged: boolean
  htmlUrl: string
  headBranch: string
  baseBranch: string
  files: Array<{
    filename: string
    status: string
    additions: number
    deletions: number
    patch: string | null
  }>
}

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

interface RunSummaryResponse {
  runId: number
  jobs: JobSummary[]
  overallSummary: string
  currentPhase: string | null
}

interface GithubStatusResponse {
  ok: boolean
  repository: {
    owner: string
    name: string
    fullName: string
    defaultBranch: string
    private: boolean
    htmlUrl: string
  }
  app: {
    appId: number
    installationId: number
    repositorySelection: string
    targetType: string
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : undefined),
      ...(init?.headers || {}),
    },
  })

  const text = await response.text()
  const contentType = response.headers.get('content-type') || ''
  let data: (T & ApiErrorPayload) | null = null

  if (text) {
    const looksLikeJson = contentType.includes('application/json') || /^[\s]*[\[{]/.test(text)

    if (looksLikeJson) {
      try {
        data = JSON.parse(text) as T & ApiErrorPayload
      } catch {
        throw new Error(`API returned invalid JSON for ${path}`)
      }
    }
  }

  if (!response.ok) {
    if (data?.error || data?.message) {
      throw new Error(data.error || data.message || `Request failed with HTTP ${response.status}`)
    }

    if (/^\s*</.test(text)) {
      throw new Error(
        `API returned HTML instead of JSON for ${path} (HTTP ${response.status}). controlplane-api may need restart.`,
      )
    }

    if (text.trim()) {
      throw new Error(text.trim())
    }

    throw new Error(`Request failed with HTTP ${response.status}`)
  }

  if (text && data === null) {
    if (/^\s*</.test(text)) {
      throw new Error(`API returned HTML instead of JSON for ${path}. Check API server routing.`)
    }

    throw new Error(`API returned a non-JSON response for ${path}`)
  }

  return data as T
}

function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) {
    return '-'
  }

  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return '-'
  }

  const totalSeconds = Math.floor((end - start) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

function pickPreferredRun(runs: WorkflowRun[]): WorkflowRun | null {
  const selectableRuns = getSelectableRuns(runs)
  return selectableRuns.find((run) => run.status !== 'completed' || run.conclusion === 'failure') || selectableRuns[0] || null
}

function isPipelineWorkflowRun(run: WorkflowRun): boolean {
  return PIPELINE_WORKFLOW_NAMES.includes(run.name as (typeof PIPELINE_WORKFLOW_NAMES)[number])
}

function getSelectableRuns(runs: WorkflowRun[]): WorkflowRun[] {
  const pipelineRuns = runs.filter(isPipelineWorkflowRun)
  return pipelineRuns.length > 0 ? pipelineRuns : runs
}

function getVisibleWorkflowRuns(runs: WorkflowRun[]): WorkflowRun[] {
  const selectableRuns = getSelectableRuns(runs)

  return PIPELINE_WORKFLOW_NAMES.map((workflowName) => selectableRuns.find((run) => run.name === workflowName)).filter(
    (run): run is WorkflowRun => !!run,
  )
}

function getLatestRunForWorkflowId(runs: WorkflowRun[], workflowId: number | null): WorkflowRun | null {
  if (!workflowId) {
    return null
  }

  return getSelectableRuns(runs).find((run) => run.workflowId === workflowId) || null
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function isFreshFullPipelineRun(
  run: WorkflowRun,
  branch: string,
  requestedAtMs: number,
  previousNewestRunId: number | null,
) {
  const createdAtMs = new Date(run.createdAt).getTime()

  if (run.id === previousNewestRunId) {
    return false
  }

  if (run.name !== FULL_PIPELINE_WORKFLOW_NAME || run.event !== 'workflow_dispatch' || run.branch !== branch) {
    return false
  }

  if (Number.isNaN(createdAtMs)) {
    return false
  }

  return createdAtMs >= requestedAtMs - 5000
}

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) {
    return '-'
  }

  const timestamp = new Date(isoString).getTime()
  if (Number.isNaN(timestamp)) {
    return '-'
  }

  const diffMs = timestamp - Date.now()
  const diffMinutes = Math.round(diffMs / 60000)
  const formatter = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' })

  if (Math.abs(diffMinutes) < 1) {
    return '방금 전'
  }

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute')
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour')
  }

  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}

function formatDateTime(isoString?: string | null): string {
  if (!isoString) {
    return '-'
  }

  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortSha(sha?: string | null): string {
  return sha ? sha.slice(0, 7) : '-'
}

function getRunStatusPresentation(status: string, conclusion: string | null) {
  if (status !== 'completed') {
    return {
      dot: 'bg-blue-500 animate-pulse',
      badge: 'bg-blue-100 text-blue-700',
      label: status === 'queued' ? '대기중' : '실행중',
    }
  }

  if (conclusion === 'success') {
    return {
      dot: 'bg-green-500',
      badge: 'bg-green-100 text-green-700',
      label: '성공',
    }
  }

  if (conclusion === 'cancelled') {
    return {
      dot: 'bg-gray-400',
      badge: 'bg-gray-100 text-gray-700',
      label: '취소됨',
    }
  }

  return {
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700',
    label: '실패',
  }
}

function getStepTone(conclusion: string | null, status: string) {
  if (status !== 'completed') {
    return {
      dot: 'bg-blue-500',
      text: 'text-blue-700',
      label: '진행중',
    }
  }

  if (conclusion === 'success') {
    return {
      dot: 'bg-green-500',
      text: 'text-green-700',
      label: '성공',
    }
  }

  if (conclusion === 'skipped') {
    return {
      dot: 'bg-gray-400',
      text: 'text-gray-600',
      label: '건너뜀',
    }
  }

  return {
    dot: 'bg-red-500',
    text: 'text-red-700',
    label: '실패',
  }
}

function splitLogLines(content: string): string[] {
  return content.split(/\r?\n/)
}

type ParsedLogTone =
  | 'default'
  | 'error'
  | 'warning'
  | 'notice'
  | 'command'
  | 'group'
  | 'debug'
  | 'muted'
  | 'info'

interface ParsedLogLine {
  lineNumber: number
  timestamp: string | null
  message: string
  tone: ParsedLogTone
  indentLevel: number
}

function parseLogLines(content: string): ParsedLogLine[] {
  const lines = splitLogLines(content)
  let currentIndentLevel = 0

  return lines.map((rawLine, index) => {
    const lineNumber = index + 1
    const timestampMatch = rawLine.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?(.*)$/,
    )

    const timestamp = timestampMatch?.[1] || null
    const body = timestampMatch?.[2] ?? rawLine
    const markerMatch = body.match(
      /^(##\[(group|endgroup|error|warning|notice|command|debug|section)\]|::(error|warning|notice|group|endgroup)::)(.*)$/,
    )

    let indentLevel = currentIndentLevel
    let tone: ParsedLogTone = 'default'
    let message = body

    if (markerMatch) {
      const bracketMarker = markerMatch[2]
      const workflowCommandMarker = markerMatch[4]
      const marker = bracketMarker || workflowCommandMarker
      const tail = markerMatch[5]?.trim() || ''

      if (marker === 'endgroup') {
        currentIndentLevel = Math.max(0, currentIndentLevel - 1)
        indentLevel = currentIndentLevel
        tone = 'muted'
        message = tail || 'End group'
      } else if (marker === 'group') {
        indentLevel = currentIndentLevel
        tone = 'group'
        message = tail || 'Group'
        currentIndentLevel += 1
      } else if (marker === 'error') {
        tone = 'error'
        message = tail || body
      } else if (marker === 'warning') {
        tone = 'warning'
        message = tail || body
      } else if (marker === 'notice' || marker === 'section') {
        tone = 'notice'
        message = tail || body
      } else if (marker === 'command') {
        tone = 'command'
        message = tail || body
      } else if (marker === 'debug') {
        tone = 'debug'
        message = tail || body
      }
    } else if (/logs are not available yet/i.test(body) || /downloadable log archive/i.test(body)) {
      tone = 'info'
      message = body
    } else if (/error|failed|fatal/i.test(body)) {
      tone = 'error'
      message = body
    } else if (/warn|warning/i.test(body)) {
      tone = 'warning'
      message = body
    } else if (body.trim().length === 0) {
      tone = 'muted'
      message = ''
    }

    return {
      lineNumber,
      timestamp,
      message,
      tone,
      indentLevel,
    }
  })
}

function getLogToneClass(tone: ParsedLogTone): string {
  if (tone === 'error') {
    return 'text-red-700'
  }

  if (tone === 'warning') {
    return 'text-amber-700'
  }

  if (tone === 'notice') {
    return 'text-sky-700'
  }

  if (tone === 'command') {
    return 'text-emerald-700'
  }

  if (tone === 'group') {
    return 'text-gray-900 font-semibold'
  }

  if (tone === 'debug') {
    return 'text-fuchsia-700'
  }

  if (tone === 'info') {
    return 'text-cyan-700'
  }

  if (tone === 'muted') {
    return 'text-gray-400'
  }

  return 'text-gray-700'
}

export default function GitActionsPage() {
  const [status, setStatus] = useState<GithubStatusResponse | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [jobs, setJobs] = useState<WorkflowJob[]>([])
  const [logs, setLogs] = useState<WorkflowJobLog[]>([])
  const [expandedJobIds, setExpandedJobIds] = useState<number[]>([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [executeLoading, setExecuteLoading] = useState(false)
  const [rerunLoading, setRerunLoading] = useState(false)
  const [rerunAction, setRerunAction] = useState<'all' | 'failed' | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [runSummary, setRunSummary] = useState<RunSummaryResponse | null>(null)
  const [prReview, setPrReview] = useState<PrReview | null>(null)
  const [applyLoading, setApplyLoading] = useState(false)
  const [prActionLoading, setPrActionLoading] = useState(false)
  const selectedRunIdRef = useRef<number | null>(null)
  const selectedWorkflowIdRef = useRef<number | null>(null)
  const manualSelectionVersionRef = useRef(0)
  const latestDetailRequestIdRef = useRef(0)
  const latestLogsRequestIdRef = useRef(0)
  const latestSummaryRequestIdRef = useRef(0)

  const selectedRun = runs.find((run) => run.id === selectedRunId) || null
  const isGithubDisconnected = !loadingStatus && (!status || !!statusError)

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId
  }, [selectedRunId])

  useEffect(() => {
    selectedWorkflowIdRef.current = selectedRun?.workflowId ?? null
  }, [selectedRun])

  async function fetchRuns(limit = 20) {
    const response = await apiFetch<WorkflowRunsResponse>(`/api/github/runs?limit=${limit}`)
    return response.runs
  }

  function handleSelectRun(runId: number) {
    manualSelectionVersionRef.current += 1
    setSelectedRunId(runId)
  }

  async function loadRunSummary(runId: number) {
    const requestId = latestSummaryRequestIdRef.current + 1
    latestSummaryRequestIdRef.current = requestId

    try {
      const response = await apiFetch<RunSummaryResponse>(`/api/github/runs/${runId}/summary`)
      if (latestSummaryRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return
      }
      setRunSummary(response)
    } catch {
      if (latestSummaryRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return
      }
      setRunSummary(null)
    }
  }

  async function loadRunLogs(runId: number) {
    const requestId = latestLogsRequestIdRef.current + 1
    latestLogsRequestIdRef.current = requestId

    try {
      const response = await apiFetch<WorkflowLogsResponse>(`/api/github/runs/${runId}/logs`)
      if (latestLogsRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return []
      }

      setLogs(response.logs)
      setExpandedJobIds((current) => (current.length > 0 ? current : response.selectedJobIds))
      return response.logs
    } catch {
      if (latestLogsRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return []
      }

      setLogs([])
      return []
    }
  }

  async function loadStatus(silent = false) {
    if (!silent) {
      setLoadingStatus(true)
    }

    setStatusError(null)

    try {
      const response = await apiFetch<GithubStatusResponse>('/api/github/status')
      setStatus(response)
    } catch (error) {
      setStatus(null)
      setStatusError(error instanceof Error ? error.message : 'GitHub App 연결 상태를 확인하지 못했습니다.')
    } finally {
      if (!silent) {
        setLoadingStatus(false)
      }
    }
  }

  async function loadRuns(
    silent = false,
    options?: {
      preserveSelection?: boolean
      preferredRunId?: number | null
    },
  ) {
    if (!silent) {
      setLoadingRuns(true)
    }

    setRunsError(null)

    try {
      const nextRuns = await fetchRuns()
      const preferredRunId = options?.preferredRunId ?? null
      const preserveSelection = options?.preserveSelection ?? true
      const selectableRuns = getSelectableRuns(nextRuns)
      const preferredRun = preferredRunId ? nextRuns.find((run) => run.id === preferredRunId) || null : null
      const preservedRun =
        preserveSelection && selectedWorkflowIdRef.current
          ? selectableRuns.find((run) => run.workflowId === selectedWorkflowIdRef.current) || null
          : null
      const nextSelectedRun = preferredRun || preservedRun || pickPreferredRun(nextRuns)

      setRuns(nextRuns)
      setSelectedRunId(nextSelectedRun?.id ?? null)
      return nextRuns
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : '실행 목록을 불러오지 못했습니다.')
      return []
    } finally {
      if (!silent) {
        setLoadingRuns(false)
      }
    }
  }

  async function waitForFreshFullPipelineRun(
    branch: string,
    requestedAtMs: number,
    previousNewestRunId: number | null,
  ) {
    for (let attempt = 0; attempt < NEW_RUN_POLL_ATTEMPTS; attempt += 1) {
      try {
        const nextRuns = await fetchRuns()
        const freshRun = nextRuns.find((run) =>
          isFreshFullPipelineRun(run, branch, requestedAtMs, previousNewestRunId),
        )

        setRuns(nextRuns)

        if (freshRun) {
          return freshRun
        }
      } catch {
        // Ignore transient polling failures after dispatch and keep waiting for the new run.
      }

      if (attempt < NEW_RUN_POLL_ATTEMPTS - 1) {
        await sleep(NEW_RUN_POLL_INTERVAL_MS)
      }
    }

    return null
  }

  async function loadRunDetail(runId: number, silent = false) {
    const requestId = latestDetailRequestIdRef.current + 1
    latestDetailRequestIdRef.current = requestId

    if (!silent) {
      setLoadingDetail(true)
      setDetailError(null)
    }

    try {
      const jobsResponse = await apiFetch<WorkflowJobsResponse>(`/api/github/runs/${runId}/jobs`)

      if (latestDetailRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return
      }

      setJobs(jobsResponse.jobs)
    } catch (error) {
      if (latestDetailRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return
      }

      setDetailError(error instanceof Error ? error.message : '실행 상세를 불러오지 못했습니다.')
    } finally {
      if (!silent && latestDetailRequestIdRef.current === requestId && selectedRunIdRef.current === runId) {
        setLoadingDetail(false)
      }
    }
  }

  async function handleRefresh() {
    setActionMessage(null)
    await loadStatus()
    const nextRuns = await loadRuns()
    const nextSelectedRun = getLatestRunForWorkflowId(nextRuns, selectedWorkflowIdRef.current) || pickPreferredRun(nextRuns)
    if (nextSelectedRun) {
      await Promise.all([
        loadRunDetail(nextSelectedRun.id),
        loadRunSummary(nextSelectedRun.id),
        loadRunLogs(nextSelectedRun.id),
      ])
    }
  }

  async function handleExecuteworkflow() {
    if (!status?.repository.defaultBranch) {
      return
    }

    const targetBranch = selectedRun?.branch || status.repository.defaultBranch
    const previousNewestRunId = runs[0]?.id ?? null
    const requestedAtMs = Date.now()
    const selectionVersionAtRequest = manualSelectionVersionRef.current

    setExecuteLoading(true)
    setActionMessage(null)

    try {
      await apiFetch<{ ok: boolean; workflowId: string; ref: string; message: string }>(
        '/api/github/pipeline/run-all',
        {
          method: 'POST',
          body: JSON.stringify({
            ref: targetBranch,
          }),
        },
      )

      setActionMessage(
        '전체 실행을 요청했습니다. Bootstrap Terraform State부터 GitHub Actions 체인이 새로 시작됩니다.',
      )
      const freshRun = await waitForFreshFullPipelineRun(targetBranch, requestedAtMs, previousNewestRunId)

      if (freshRun) {
        if (manualSelectionVersionRef.current === selectionVersionAtRequest) {
          setSelectedRunId(freshRun.id)
          setActionMessage(`전체 실행을 요청했고 새로 시작된 run #${freshRun.runNumber} 로 전환했습니다.`)
        } else {
          setActionMessage(`전체 실행을 요청했고 새 run #${freshRun.runNumber} 도 생성됐습니다.`)
        }
      } else {
        await loadRuns(true, { preserveSelection: false })
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '전체 실행 요청에 실패했습니다.')
    } finally {
      setExecuteLoading(false)
    }
  }

  async function handleRerun(action: 'all' | 'failed') {
    if (!selectedRunId) {
      return
    }

    setRerunLoading(true)
    setRerunAction(action)
    setActionMessage(null)

    try {
      const endpoint = action === 'all' ? 'rerun' : 'rerun-failed'
      await apiFetch<{ message: string }>(`/api/github/runs/${selectedRunId}/${endpoint}`, {
        method: 'POST',
      })

      setActionMessage(
        action === 'all'
          ? '현재 run의 모든 job 재실행을 요청했습니다.'
          : '현재 run의 실패 job 재실행을 요청했습니다.',
      )
      await loadRuns(true)
      await loadRunDetail(selectedRunId, true)
      void loadRunLogs(selectedRunId)
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? error.message
          : action === 'all'
            ? '현재 작업 재실행 요청에 실패했습니다.'
            : '현재 run의 실패 job 재실행 요청에 실패했습니다.',
      )
    } finally {
      setRerunLoading(false)
      setRerunAction(null)
    }
  }

  async function handleRerunAll() {
    await handleRerun('all')
  }

  async function handleRerunFailed() {
    await handleRerun('failed')
  }

  async function handleCopyLogs() {
    if (!selectedRunId) {
      return
    }

    const logsToCopy = logs.length > 0 ? logs : await loadRunLogs(selectedRunId)

    const combinedLog = logsToCopy
      .map((log) => [`# ${log.name}`, log.content.trim()].join('\n'))
      .filter(Boolean)
      .join('\n\n')

    if (!combinedLog) {
      setActionMessage('복사할 로그가 없습니다.')
      return
    }

    try {
      await navigator.clipboard.writeText(combinedLog)
      setActionMessage('선택한 로그를 클립보드에 복사했습니다.')
    } catch {
      setActionMessage('클립보드 복사에 실패했습니다.')
    }
  }

  async function handleSuggest() {
    if (!selectedRunId) {
      return
    }

    setSuggestLoading(true)
    setActionMessage(null)
    setPrReview(null)

    try {
      const payload = await apiFetch<SuggestResponse>(`/api/github/fix-sessions/${selectedRunId}/suggest`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setSuggestion(payload)
      setActionMessage(payload.message)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'AI 제안 요청에 실패했습니다.')
    } finally {
      setSuggestLoading(false)
    }
  }

  async function handleApply() {
    if (!selectedRunId || !suggestion?.suggestedFiles?.length) return

    setApplyLoading(true)
    setActionMessage(null)

    try {
      const result = await apiFetch<{
        ok: boolean
        branchName: string
        pullRequest: { number: number; htmlUrl: string; title: string }
      }>(`/api/github/fix-sessions/${selectedRunId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          files: suggestion.suggestedFiles,
          commitMessage: `ai fix: Terraform 수정 제안 (run #${selectedRunId})`,
          prTitle: `🤖 AI Fix: run #${selectedRunId} 에러 수정`,
          prBody: `GitHub Actions run #${selectedRunId} 실패에 대한 AI 분석 기반 Terraform 코드 수정입니다.\n\n## 에러 분석\n${suggestion.llmAnalysis || suggestion.summary || ''}`,
        }),
      })

      setActionMessage(`PR #${result.pullRequest.number} 생성 완료!`)

      // PR 상세 로드
      const pr = await apiFetch<PrReview>(`/api/github/pulls/${result.pullRequest.number}`)
      setPrReview(pr)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'PR 생성에 실패했습니다.')
    } finally {
      setApplyLoading(false)
    }
  }

  async function handleMergePr(prNumber: number) {
    setPrActionLoading(true)
    try {
      await apiFetch(`/api/github/pulls/${prNumber}/merge`, { method: 'POST', body: JSON.stringify({}) })
      const updated = await apiFetch<PrReview>(`/api/github/pulls/${prNumber}`)
      setPrReview(updated)
      setActionMessage('PR 머지 완료! 새 workflow가 곧 시작됩니다.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '머지에 실패했습니다.')
    } finally {
      setPrActionLoading(false)
    }
  }

  async function handleClosePr(prNumber: number) {
    setPrActionLoading(true)
    try {
      await apiFetch(`/api/github/pulls/${prNumber}/close`, { method: 'PATCH', body: JSON.stringify({}) })
      const updated = await apiFetch<PrReview>(`/api/github/pulls/${prNumber}`)
      setPrReview(updated)
      setActionMessage('PR를 닫았습니다.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'PR 닫기에 실패했습니다.')
    } finally {
      setPrActionLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
    void loadRuns()

    const intervalId = window.setInterval(() => {
      void loadRuns(true)
    }, POLLING_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!selectedRunId) {
      setJobs([])
      setLogs([])
      setSuggestion(null)
      setPrReview(null)
      setExpandedJobIds([])
      setRunSummary(null)
      return
    }

    setJobs([])
    setLogs([])
    setSuggestion(null)
    setPrReview(null)
    setExpandedJobIds([])
    setRunSummary(null)
    void loadRunDetail(selectedRunId)
    void loadRunSummary(selectedRunId)
    void loadRunLogs(selectedRunId)

    const intervalId = window.setInterval(() => {
      void loadRunDetail(selectedRunId, true)
      void loadRunSummary(selectedRunId)
    }, POLLING_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [selectedRunId])

  return (
    <div>
      <PageHeader
        title="GitHub Actions 로그"
        subtitle=" GitHub Actions 진행 상황과 로그를 확인합니다."
        titleAction={
          status && !statusError ? (
            <a
              href={status.repository.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:border-indigo-200 hover:text-indigo-700"
            >
              저장소 열기
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => void handleExecuteworkflow()}
              disabled={!status?.repository.defaultBranch || executeLoading || rerunLoading}
              title="Bootstrap Terraform State부터 GitHub Actions 체인을 처음부터 실행합니다."
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <Play className="h-3.5 w-3.5" />
              {executeLoading ? '전체 실행 요청중' : '전체 실행'}
            </button>
            <button
              type="button"
              onClick={() => void handleRerunAll()}
              disabled={!selectedRunId || executeLoading || rerunLoading || selectedRun?.status !== 'completed'}
              title="현재 선택한 run의 모든 job을 다시 실행합니다."
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {rerunAction === 'all' ? '현재 작업 재실행 요청중' : '현재 작업 재실행'}
            </button>
            <button
              type="button"
              onClick={() => void handleRerunFailed()}
              disabled={
                !selectedRunId ||
                executeLoading ||
                rerunLoading ||
                selectedRun?.status !== 'completed' ||
                selectedRun?.conclusion === 'success'
              }
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              <Play className="h-3.5 w-3.5" />
              {rerunAction === 'failed' ? '재실행 요청중' : '실패 작업 재실행'}
            </button>
          </div>
        }
      />

      {actionMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {isGithubDisconnected ? (
        <GitAppDisconnectedCard error={statusError} onRefresh={() => void handleRefresh()} />
      ) : (
        <div className="space-y-6">
          <WorkflowRunList
            runs={runs}
            selectedRunId={selectedRunId}
            loading={loadingRuns}
            error={runsError}
            onSelect={handleSelectRun}
          />

          <PipelineGraph
            workflowName={selectedRun?.name ?? null}
            jobs={jobs}
            activeJobId={expandedJobIds.length > 0 ? expandedJobIds[0] : null}
            onJobClick={(jobId) => setExpandedJobIds([jobId])}
          />

          <RunDetail
            run={selectedRun}
            jobs={jobs}
            logs={logs}
            expandedJobIds={expandedJobIds}
            loading={loadingDetail}
            error={detailError}
            onToggleJob={(jobId) =>
              setExpandedJobIds((current) =>
                current.includes(jobId) ? current.filter((value) => value !== jobId) : [...current, jobId],
              )
            }
            onCopyLogs={() => void handleCopyLogs()}
            onSuggest={() => void handleSuggest()}
            suggestLoading={suggestLoading}
            suggestion={suggestion}
            runSummary={runSummary}
            onApply={() => void handleApply()}
            applyLoading={applyLoading}
            prReview={prReview}
            onMergePr={(n) => void handleMergePr(n)}
            onClosePr={(n) => void handleClosePr(n)}
            prActionLoading={prActionLoading}
          />
        </div>
      )}
    </div>
  )
}

function GitAppDisconnectedCard({ error, onRefresh }: { error: string | null; onRefresh: () => void }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">GitHub App 연결이 안된 상태입니다.</p>
          <p className="mt-1 text-sm text-amber-800">연결이 복구되면 이 자리에 3개 워크플로의 최신 상태가 표시됩니다.</p>
          {error && <p className="mt-2 break-words text-xs text-amber-700">{error}</p>}
          <button
            type="button"
            onClick={onRefresh}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            다시 확인
          </button>
        </div>
      </div>
    </div>
  )
}

interface WorkflowRunListProps {
  runs: WorkflowRun[]
  selectedRunId: number | null
  loading: boolean
  error: string | null
  onSelect: (runId: number) => void
}

function WorkflowRunList({
  runs,
  selectedRunId,
  loading,
  error,
  onSelect,
}: WorkflowRunListProps) {
  const visibleRuns = getVisibleWorkflowRuns(runs)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 min-w-0">
        <p className="text-sm font-medium text-gray-700">WORKFLOW</p>
      </div>

      {loading && visibleRuns.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          workflow의 최신 상태를 불러오는 중입니다.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && visibleRuns.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          표시할 workflow가 없습니다.
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-3">
        {visibleRuns.map((run) => {
          const presentation = getRunStatusPresentation(run.status, run.conclusion)
          const selected = selectedRunId === run.id

          return (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelect(run.id)}
              className={cn(
                'w-full rounded-xl border p-4 text-left transition-colors',
                selected
                  ? 'border-indigo-300 bg-indigo-50/70 shadow-sm'
                  : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', presentation.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{run.name || 'Unnamed workflow'}</p>
                      <p className="mt-1 text-sm leading-5 text-gray-600">{getWorkflowDescription(run.name || '')}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{formatRelativeTime(run.createdAt)}</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      <span>{formatDuration(run.createdAt, run.updatedAt)}</span>
                    </div>
                  </div>
                </div>
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', presentation.badge)}>
                  {presentation.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface RunDetailProps {
  run: WorkflowRun | null
  jobs: WorkflowJob[]
  logs: WorkflowJobLog[]
  expandedJobIds: number[]
  loading: boolean
  error: string | null
  onToggleJob: (jobId: number) => void
  onCopyLogs: () => void
  onSuggest: () => void
  suggestLoading: boolean
  suggestion: SuggestResponse | null
  runSummary: RunSummaryResponse | null
  onApply: () => void
  applyLoading: boolean
  prReview: PrReview | null
  onMergePr: (prNumber: number) => void
  onClosePr: (prNumber: number) => void
  prActionLoading: boolean
}

function RunDetail({
  run,
  jobs,
  logs,
  expandedJobIds,
  loading,
  error,
  onToggleJob,
  onCopyLogs,
  onSuggest,
  suggestLoading,
  suggestion,
  runSummary,
  onApply,
  applyLoading,
  prReview,
  onMergePr,
  onClosePr,
  prActionLoading,
}: RunDetailProps) {
  const logByJobId = new Map(logs.map((log) => [log.jobId, log]))
  const summaryByJobId = new Map((runSummary?.jobs || []).map((js) => [js.jobId, js]))
  const [expandedLogJobIds, setExpandedLogJobIds] = useState<number[]>([])

  if (!run) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        상단 목록에서 workflow run을 선택하세요.
      </div>
    )
  }

  const presentation = getRunStatusPresentation(run.status, run.conclusion)

  return (
    <div className="space-y-4">
      {/* Current Phase Badge */}
      {runSummary?.currentPhase && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-4 py-2.5">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-sm font-medium text-indigo-800">{runSummary.currentPhase}</span>
          {runSummary.overallSummary && (
            <span className="text-xs text-indigo-500">· {runSummary.overallSummary}</span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 border-b border-gray-100 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{run.name || 'Unnamed workflow'}</h3>
                <span className={cn('rounded px-2 py-0.5 text-xs font-medium', presentation.badge)}>{presentation.label}</span>
                <a
                  href={run.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  GitHub 열기
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  <span>{run.branch || 'detached'}</span>
                </div>
                <span># {shortSha(run.sha)}</span>
                <div className="flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  <span>{formatDuration(run.createdAt, run.updatedAt)}</span>
                </div>
                <span>{run.actor || 'unknown'}</span>
                <span>{formatDateTime(run.createdAt)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSuggest}
                disabled={suggestLoading || run.conclusion === 'success'}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {suggestLoading ? 'AI 분석중...' : 'AI 에러 분석'}
              </button>
              <button
                type="button"
                onClick={onCopyLogs}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                <Copy className="h-3.5 w-3.5" />
                로그 복사
              </button>
            </div>
          </div>
        </div>

        {suggestion && (
          <div className="mb-4 space-y-3">
            {/* AI 분석 메인 카드 */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="font-medium">
                    AI 에러 분석
                    {suggestion.mode === 'hybrid' && (
                      <span className="ml-2 rounded bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-normal uppercase">LLM + Rule</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-amber-500">
                  {suggestion.mode && <span>모드: {suggestion.mode}</span>}
                  {suggestion.configuredModel && <span>· {suggestion.configuredModel}</span>}
                </div>
              </div>

              {/* LLM 분석 결과 (새 프롬프트 형식) */}
              {suggestion.llmAnalysis && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-3 text-sm leading-relaxed text-amber-950 whitespace-pre-wrap">
                  {suggestion.llmAnalysis}
                </div>
              )}

              {/* Rule-based 요약 (LLM 없을 때) */}
              {!suggestion.llmAnalysis && suggestion.summary && (
                <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
                  <SuggestionRow label="요약" value={suggestion.summary} />
                  {suggestion.rootCause && <SuggestionRow label="원인" value={suggestion.rootCause} />}
                  {suggestion.riskLevel && <SuggestionRow label="위험도" value={suggestion.riskLevel} />}
                  {suggestion.nextActions && suggestion.nextActions.length > 0 && (
                    <SuggestionList
                      label="다음 조치"
                      items={suggestion.nextActions}
                      getKey={(item) => item}
                      renderItem={(item) => item}
                    />
                  )}
                </div>
              )}
            </div>

            {/* 코드 수정 제안 + 적용 버튼 */}
            {suggestion.suggestedFiles && suggestion.suggestedFiles.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-800">
                      Terraform 코드 수정 제안
                      <span className="ml-2 text-xs font-normal text-emerald-500">
                        {suggestion.suggestedFiles.length}개 파일
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onApply}
                    disabled={applyLoading || !!prReview}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <GitPullRequest className="h-3.5 w-3.5" />
                    {applyLoading ? 'PR 생성 중...' : prReview ? 'PR 생성됨' : '적용 (PR 생성)'}
                  </button>
                </div>

                {/* 수정 파일 목록 */}
                <div className="mt-3 space-y-2">
                  {suggestion.suggestedFiles.map((file) => (
                    <details key={file.path} className="rounded-lg border border-emerald-200 bg-white overflow-hidden">
                      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50">
                        <FileCode className="h-3.5 w-3.5 shrink-0" />
                        {file.path}
                      </summary>
                      <pre className="overflow-x-auto bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">
                        <code>{file.content}</code>
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* PR 리뷰 패널 */}
            {prReview && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4 text-indigo-600" />
                    <div>
                      <p className="text-sm font-medium text-indigo-800">
                        PR #{prReview.number}: {prReview.title}
                      </p>
                      <p className="text-xs text-indigo-500">
                        {prReview.headBranch} → {prReview.baseBranch}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* PR 상태 배지 */}
                    {prReview.merged ? (
                      <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
                        <GitMerge className="h-3 w-3" /> 머지됨
                      </span>
                    ) : prReview.state === 'closed' ? (
                      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                        <X className="h-3 w-3" /> 닫힘
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <GitPullRequest className="h-3 w-3" /> 열림
                      </span>
                    )}

                    {/* 액션 버튼 (열린 PR만) */}
                    {!prReview.merged && prReview.state === 'open' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onMergePr(prReview.number)}
                          disabled={prActionLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          <GitMerge className="h-3.5 w-3.5" />
                          {prActionLoading ? '처리 중...' : '머지'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onClosePr(prReview.number)}
                          disabled={prActionLoading}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" />
                          닫기
                        </button>
                      </>
                    )}

                    <a
                      href={prReview.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                    >
                      GitHub
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Diff 표시 */}
                {prReview.files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {prReview.files.map((file) => (
                      <details key={file.filename} className="rounded-lg border border-indigo-200 bg-white overflow-hidden">
                        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs hover:bg-indigo-50">
                          <span className="font-medium text-indigo-800">{file.filename}</span>
                          <span className="flex items-center gap-2 text-[11px]">
                            <span className="text-emerald-600">+{file.additions}</span>
                            <span className="text-red-500">-{file.deletions}</span>
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">{file.status}</span>
                          </span>
                        </summary>
                        {file.patch && (
                          <pre className="overflow-x-auto bg-slate-950 p-3 text-[11px] leading-relaxed">
                            {file.patch.split('\n').map((line, i) => (
                              <div
                                key={i}
                                className={cn(
                                  line.startsWith('+') && !line.startsWith('+++') ? 'text-emerald-400' :
                                    line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' :
                                      line.startsWith('@@') ? 'text-blue-400' : 'text-slate-400'
                                )}
                              >
                                {line}
                              </div>
                            ))}
                          </pre>
                        )}
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {loading && jobs.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            실행 상세를 불러오는 중입니다.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
            이 실행에는 표시할 job 정보가 없습니다.
          </div>
        )}

        <div className="space-y-3">
          {jobs.map((job) => {
            const log = logByJobId.get(job.id)
            const jobSummary = summaryByJobId.get(job.id)
            const tone = getStepTone(job.conclusion, job.status)
            const expanded = expandedJobIds.includes(job.id)
            const logExpanded = expandedLogJobIds.includes(job.id)

            return (
              <div key={job.id} className="overflow-hidden rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => onToggleJob(job.id)}
                  className="flex w-full items-center justify-between bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                >
                  <div className="flex items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <div className={cn('h-2 w-2 rounded-full', tone.dot)} />
                    <span className={cn('text-sm font-medium', tone.text)}>{job.name}</span>
                    <span className="text-xs text-gray-400">{tone.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Job summary badge */}
                    {jobSummary && (
                      <span className="hidden text-xs text-gray-400 sm:inline">{jobSummary.summary}</span>
                    )}
                    <span className="text-xs text-gray-400">{formatDuration(job.startedAt, job.completedAt)}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100">
                    <div className="flex flex-wrap items-center gap-3 bg-white px-4 py-3 text-xs text-gray-500">
                      <span>runner: {job.runnerName || 'unknown'}</span>
                      <span>started: {formatDateTime(job.startedAt)}</span>
                      {job.labels.length > 0 && <span>labels: {job.labels.join(', ')}</span>}
                      {job.htmlUrl && (
                        <a
                          href={job.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
                        >
                          Job 링크
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {/* Step Timeline with summaries */}
                    {jobSummary && jobSummary.steps.length > 0 ? (
                      <div className="border-t border-gray-100 bg-white">
                        <StepTimeline
                          steps={jobSummary.steps.map((s) => ({
                            name: s.name,
                            number: s.number,
                            status: s.status,
                            conclusion: s.conclusion,
                            summary: s.summary,
                            durationSeconds: s.durationSeconds,
                          }))}
                        />
                      </div>
                    ) : job.steps.length > 0 ? (
                      <div className="border-t border-gray-100 bg-white">
                        <StepTimeline
                          steps={job.steps.map((s) => ({
                            name: s.name,
                            number: s.number,
                            status: s.status,
                            conclusion: s.conclusion,
                            startedAt: s.startedAt,
                            completedAt: s.completedAt,
                          }))}
                        />
                      </div>
                    ) : null}

                    {/* Log toggle */}
                    <div className="border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedLogJobIds((prev) =>
                            prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id],
                          )
                        }
                        className="flex w-full items-center gap-2 bg-gray-50 px-4 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-100"
                      >
                        <Code2 className="h-3.5 w-3.5" />
                        {logExpanded ? '원시 로그 숨기기' : '원시 로그 보기'}
                        {logExpanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </button>

                      {logExpanded && (
                        <div className="bg-[#f6f8fa] px-4 py-4">
                          {log ? (
                            <LogViewer jobId={job.id} content={log.content} />
                          ) : (
                            <div className="text-gray-400">이 job은 현재 선택된 로그 대상이 아닙니다.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LogViewer({ jobId, content }: { jobId: number; content: string }) {
  const parsedLines = parseLogLines(content)

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white font-mono text-xs shadow-sm">
      <div className="grid grid-cols-[72px_160px_minmax(0,1fr)] border-b border-gray-200 bg-[#f6f8fa] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
        <span>Line</span>
        <span>Time</span>
        <span>Log</span>
      </div>
      <div className="max-h-[560px] overflow-auto bg-white">
        {parsedLines.map((line) => (
          <div
            key={`${jobId}-line-${line.lineNumber}`}
            className="grid grid-cols-[72px_160px_minmax(0,1fr)] border-b border-gray-100 px-3 py-1.5 last:border-b-0 even:bg-[#f6f8fa]"
          >
            <div className="select-none pr-3 text-right text-[11px] text-gray-400">{line.lineNumber}</div>
            <div className="pr-3 text-[11px] text-gray-500">{line.timestamp || '-'}</div>
            <div
              className={`min-w-0 whitespace-pre-wrap break-words py-0.5 ${getLogToneClass(line.tone)}`}
              style={{ paddingLeft: `${line.indentLevel * 16}px` }}
            >
              {line.message || ' '}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SuggestionRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  )
}

function SuggestionList<T>({
  label,
  items,
  getKey,
  renderItem,
}: {
  label: string
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T) => string
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">{label}</p>
      <div className="mt-1 space-y-1">
        {items.map((item) => (
          <p key={getKey(item)}>{`- ${renderItem(item)}`}</p>
        ))}
      </div>
    </div>
  )
}
