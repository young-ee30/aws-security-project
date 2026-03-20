import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  GitBranch,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/Header'
import { cn } from '@/lib/utils'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:4000'
const POLLING_INTERVAL_MS = 15000

interface WorkflowRun {
  id: number
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
  configuredModel?: string
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
  const data = text ? (JSON.parse(text) as T & ApiErrorPayload) : null

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed with HTTP ${response.status}`)
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
  const [rerunLoading, setRerunLoading] = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<SuggestResponse | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  const selectedRun = runs.find((run) => run.id === selectedRunId) || null

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

  async function loadRuns(silent = false) {
    if (!silent) {
      setLoadingRuns(true)
    }

    setRunsError(null)

    try {
      const response = await apiFetch<WorkflowRunsResponse>('/api/github/runs?limit=20')
      setRuns(response.runs)
      setLastSyncedAt(new Date().toISOString())
      setSelectedRunId((current) => {
        if (current && response.runs.some((run) => run.id === current)) {
          return current
        }

        const preferredRun =
          response.runs.find((run) => run.status !== 'completed' || run.conclusion === 'failure') ||
          response.runs[0]

        return preferredRun?.id ?? null
      })
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : '실행 목록을 불러오지 못했습니다.')
    } finally {
      if (!silent) {
        setLoadingRuns(false)
      }
    }
  }

  async function loadRunDetail(runId: number, silent = false) {
    if (!silent) {
      setLoadingDetail(true)
      setDetailError(null)
    }

    try {
      const [jobsResponse, logsResponse] = await Promise.all([
        apiFetch<WorkflowJobsResponse>(`/api/github/runs/${runId}/jobs`),
        apiFetch<WorkflowLogsResponse>(`/api/github/runs/${runId}/logs`),
      ])

      setJobs(jobsResponse.jobs)
      setLogs(logsResponse.logs)
      setExpandedJobIds((current) => (current.length > 0 && silent ? current : logsResponse.selectedJobIds))
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : '실행 상세를 불러오지 못했습니다.')
    } finally {
      if (!silent) {
        setLoadingDetail(false)
      }
    }
  }

  async function handleRefresh() {
    setActionMessage(null)
    await loadStatus()
    await loadRuns()
    if (selectedRunId) {
      await loadRunDetail(selectedRunId)
    }
  }

  async function handleRerunFailed() {
    if (!selectedRunId) {
      return
    }

    setRerunLoading(true)
    setActionMessage(null)

    try {
      const response = await apiFetch<{ message: string }>(`/api/github/runs/${selectedRunId}/rerun-failed`, {
        method: 'POST',
      })

      setActionMessage(response.message)
      await loadRuns(true)
      await loadRunDetail(selectedRunId, true)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '재실행 요청에 실패했습니다.')
    } finally {
      setRerunLoading(false)
    }
  }

  async function handleCopyLogs() {
    const combinedLog = logs
      .map((log) => [`# ${log.name}`, log.content.trim()].join('\n'))
      .filter(Boolean)
      .join('\n\n')

    if (!combinedLog) {
      setActionMessage('복사할 로그가 없습니다.')
      return
    }

    try {
      await navigator.clipboard.writeText(combinedLog)
      setActionMessage('실패 로그를 클립보드에 복사했습니다.')
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

    try {
      const response = await fetch(`${API_BASE_URL}/api/github/fix-sessions/${selectedRunId}/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      const payload = (await response.json()) as SuggestResponse
      setSuggestion(payload)
      setActionMessage(payload.message)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'AI 제안 요청에 실패했습니다.')
    } finally {
      setSuggestLoading(false)
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
      setExpandedJobIds([])
      return
    }

    setSuggestion(null)
    setExpandedJobIds([])
    void loadRunDetail(selectedRunId)

    const intervalId = window.setInterval(() => {
      void loadRunDetail(selectedRunId, true)
    }, POLLING_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [selectedRunId])

  const lastUpdatedLabel = lastSyncedAt ? formatRelativeTime(lastSyncedAt) : undefined

  return (
    <div>
      <PageHeader
        title="GitHub Actions 로그"
        subtitle="실제 GitHub Actions 실행 현황과 실패 로그를 대시보드에서 확인합니다."
        lastUpdated={lastUpdatedLabel}
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
              onClick={() => void handleRerunFailed()}
              disabled={!selectedRunId || rerunLoading || selectedRun?.conclusion === 'success'}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              <Play className="h-3.5 w-3.5" />
              {rerunLoading ? '재실행 요청중' : '실패 작업 재실행'}
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

      <ConnectionStatusCard status={status} loading={loadingStatus} error={statusError} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PipelineList
            runs={runs}
            selectedRunId={selectedRunId}
            loading={loadingRuns}
            error={runsError}
            onRefresh={() => void loadRuns()}
            onSelect={setSelectedRunId}
          />
        </div>

        <div className="lg:col-span-2">
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
          />
        </div>
      </div>
    </div>
  )
}

interface ConnectionStatusCardProps {
  status: GithubStatusResponse | null
  loading: boolean
  error: string | null
}

function ConnectionStatusCard({ status, loading, error }: ConnectionStatusCardProps) {
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">GitHub App Status</p>
          <h3 className="mt-1 text-sm font-semibold text-gray-900">API 연결 상태</h3>
        </div>
        {status && !error && (
          <a
            href={status.repository.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
          >
            저장소 열기
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {loading && (
        <p className="mt-4 text-sm text-gray-500">GitHub App 설치와 저장소 연결 상태를 확인하는 중입니다.</p>
      )}

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      {!loading && !error && status && (
        <div className="mt-4 grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700 md:grid-cols-2 xl:grid-cols-4">
          <StatusItem label="저장소" value={status.repository.fullName} />
          <StatusItem label="기본 브랜치" value={status.repository.defaultBranch} />
          <StatusItem label="Installation ID" value={String(status.app.installationId)} />
          <StatusItem label="App ID" value={String(status.app.appId)} />
        </div>
      )}
    </div>
  )
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}

interface PipelineListProps {
  runs: WorkflowRun[]
  selectedRunId: number | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onSelect: (runId: number) => void
}

function PipelineList({ runs, selectedRunId, loading, error, onRefresh, onSelect }: PipelineListProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{runs.length}개 실행</span>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {loading && runs.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          실행 목록을 불러오는 중입니다.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          표시할 workflow run이 없습니다.
        </div>
      )}

      <div className="space-y-3">
        {runs.map((run) => (
          <PipelineItem
            key={run.id}
            run={run}
            selected={selectedRunId === run.id}
            onSelect={() => onSelect(run.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface PipelineItemProps {
  run: WorkflowRun
  selected: boolean
  onSelect: () => void
}

function PipelineItem({ run, selected, onSelect }: PipelineItemProps) {
  const presentation = getRunStatusPresentation(run.status, run.conclusion)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-indigo-300 bg-indigo-50/70' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-2 h-2 w-2 rounded-full', presentation.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-gray-900">{run.name || 'Unnamed workflow'}</span>
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium', presentation.badge)}>{presentation.label}</span>
          </div>
          <p className="mt-1 truncate text-xs text-gray-500">{run.displayTitle || `${run.event} · run #${run.runNumber}`}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              <span>{run.branch || 'detached'}</span>
            </div>
            <span>#</span>
            <span>{shortSha(run.sha)}</span>
            <div className="flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              <span>{formatDuration(run.createdAt, run.updatedAt)}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {formatRelativeTime(run.createdAt)} · {run.actor || 'unknown'}
          </p>
        </div>
      </div>
    </button>
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
}: RunDetailProps) {
  const logByJobId = new Map(logs.map((log) => [log.jobId, log]))

  if (!run) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        왼쪽 목록에서 workflow run을 선택하세요.
      </div>
    )
  }

  const presentation = getRunStatusPresentation(run.status, run.conclusion)

  return (
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
            <p className="mt-1 text-xs text-gray-500">{run.displayTitle || `${run.event} · run #${run.runNumber}`}</p>
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
              disabled={suggestLoading}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {suggestLoading ? 'AI 요청중' : 'AI 도움 받기'}
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
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">AI 제안 응답</p>
          <p className="mt-1">{suggestion.message}</p>
          {suggestion.configuredModel && <p className="mt-1 text-xs">configured model: {suggestion.configuredModel}</p>}
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
          const tone = getStepTone(job.conclusion, job.status)
          const expanded = expandedJobIds.includes(job.id)

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
                <span className="text-xs text-gray-400">{formatDuration(job.startedAt, job.completedAt)}</span>
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

                  {job.steps.length > 0 && (
                    <div className="border-t border-gray-100 bg-white px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Steps</p>
                      <div className="space-y-2">
                        {job.steps.map((step) => {
                          const stepTone = getStepTone(step.conclusion, step.status)
                          return (
                            <div
                              key={`${job.id}-${step.number}`}
                              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn('h-2 w-2 rounded-full', stepTone.dot)} />
                                <span className="text-sm text-gray-700">{step.name}</span>
                              </div>
                              <span className="text-xs text-gray-400">{formatDuration(step.startedAt, step.completedAt)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-100 bg-gray-900 px-4 py-4 font-mono text-xs">
                    {log ? (
                      <div className="space-y-1">
                        {splitLogLines(log.content).map((line, index) => {
                          const toneClass =
                            /error|failed|fatal/i.test(line)
                              ? 'text-red-400'
                              : /warn|warning/i.test(line)
                                ? 'text-amber-300'
                                : line.trim().length === 0
                                  ? 'text-gray-600'
                                  : 'text-gray-300'

                          return (
                            <div key={`${job.id}-line-${index}`} className={toneClass}>
                              {line || ' '}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-gray-400">이 job은 현재 선택된 로그 대상이 아닙니다.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
