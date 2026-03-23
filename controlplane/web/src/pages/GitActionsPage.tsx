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
import { API_BASE_URL } from '@/lib/env'
import { cn } from '@/lib/utils'
const POLLING_INTERVAL_MS = 15000
const NEW_RUN_POLL_ATTEMPTS = 10
const NEW_RUN_POLL_INTERVAL_MS = 1500
const PIPELINE_SESSION_WINDOW_MS = 20 * 60 * 1000
const FULL_PIPELINE_WORKFLOW_NAME = 'Bootstrap Terraform State'
const PIPELINE_WORKFLOW_NAMES = [
  'Bootstrap Terraform State',
  'Terraform Dev Plan and Apply',
  'Deploy Selected Services to ECS',
] as const

function getWorkflowDescription(workflowName: string): string {
  if (workflowName === 'Bootstrap Terraform State') {
    return 'Terraform state 준비'
  }

  if (workflowName === 'Terraform Dev Plan and Apply') {
    return '보안 점검 및 배포 계획'
  }

  if (workflowName === 'Deploy Selected Services to ECS') {
    return 'ECS 이미지 배포'
  }

  return '워크플로우 개요'
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
  checkRunId?: number | null
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

interface WorkflowAnnotation {
  jobId: number
  jobName: string
  path: string | null
  startLine: number | null
  endLine: number | null
  startColumn: number | null
  endColumn: number | null
  annotationLevel: string
  message: string
  title: string | null
  rawDetails: string | null
  blobHref: string | null
}

interface WorkflowAnnotationsResponse {
  runId: number
  source?: 'github-api'
  rawCount?: number
  annotations: WorkflowAnnotation[]
}

interface WorkflowAnnotationsMeta {
  source: 'github-api' | 'unknown'
  rawCount: number
}

interface AnnotationListItem {
  key: string
  title: string | null
  message: string
  annotationLevel: string
  path: string | null
  startLine: number | null
  source: 'github-annotation' | 'job-error'
}

interface AnnotationSummary {
  key: string
  title: string | null
  message: string
  annotationLevel: string
  count: number
  samplePath: string | null
}

interface ApiErrorPayload {
  error?: string
  message?: string
}

interface SuggestResponse {
  ok: boolean
  runId: string
  message: string
  analysisKind?: 'failure' | 'informational'
  mode?: 'rule-based' | 'llm' | 'hybrid'
  configuredModel?: string
  llmStatus?: 'not_attempted' | 'success' | 'failed'
  llmError?: string
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

type SuggestionTarget =
  | { type: 'run' }
  | { type: 'annotations'; jobId: number }
  | { type: 'step'; jobId: number; stepNumber: number }

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

interface StepSelection {
  jobId: number
  stepNumber: number
}

type StepFailureTone = 'security' | 'warning'

interface CheckovFinding {
  checkId: string
  title: string
  resource: string | null
  path: string | null
  startLine: number | null
  guide: string | null
  isCustomPolicy: boolean
}

interface CheckovStepInsight {
  tone: StepFailureTone
  summary: string
  compactSummary: string
  helperText: string
  findings: CheckovFinding[]
  customFindings: CheckovFinding[]
  builtinFindings: CheckovFinding[]
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

function getRunCreatedAtMs(run: WorkflowRun): number {
  const createdAtMs = new Date(run.createdAt).getTime()
  return Number.isNaN(createdAtMs) ? 0 : createdAtMs
}

function getVisibleWorkflowRuns(runs: WorkflowRun[]): WorkflowRun[] {
  const selectableRuns = getSelectableRuns(runs)
  const anchorRun =
    selectableRuns.find((run) => run.status !== 'completed') ||
    selectableRuns[0] ||
    null

  if (!anchorRun) {
    return []
  }

  const anchorCreatedAtMs = getRunCreatedAtMs(anchorRun)
  const anchorBranch = anchorRun.branch
  const sessionRuns = selectableRuns.filter((run) => {
    if (anchorBranch && run.branch && run.branch !== anchorBranch) {
      return false
    }

    const createdAtMs = getRunCreatedAtMs(run)
    return Math.abs(anchorCreatedAtMs - createdAtMs) <= PIPELINE_SESSION_WINDOW_MS
  })

  return PIPELINE_WORKFLOW_NAMES.map((workflowName) => sessionRuns.find((run) => run.name === workflowName)).filter(
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

function getAnnotationPresentation(level: string) {
  if (level === 'failure') {
    return {
      badge: 'bg-red-100 text-red-700',
      label: 'failure',
    }
  }

  if (level === 'warning') {
    return {
      badge: 'bg-amber-100 text-amber-700',
      label: 'warning',
    }
  }

  return {
    badge: 'bg-sky-100 text-sky-700',
    label: level || 'notice',
  }
}

function summarizeAnnotations(
  annotations: Array<Pick<WorkflowAnnotation, 'annotationLevel' | 'title' | 'message' | 'path'>>,
): AnnotationSummary[] {
  const grouped = new Map<string, AnnotationSummary>()

  for (const annotation of annotations) {
    const key = `${annotation.annotationLevel}::${annotation.title || ''}::${annotation.message}`
    const existing = grouped.get(key)

    if (existing) {
      existing.count += 1
      continue
    }

    grouped.set(key, {
      key,
      title: annotation.title,
      message: annotation.message,
      annotationLevel: annotation.annotationLevel,
      count: 1,
      samplePath: annotation.path,
    })
  }

  return [...grouped.values()]
}

function splitLogLines(content: string): string[] {
  return content.split(/\r?\n/)
}

function normalizeLogErrorLine(line: string): string {
  return line
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/, '')
    .replace(/^##\[(?:error|warning|notice)\]\s*/, '')
    .trim()
}

function extractTerminalErrors(content: string | undefined): string[] {
  if (!content) {
    return []
  }

  const unique = new Set<string>()
  const errors: string[] = []

  for (const rawLine of splitLogLines(content)) {
    const line = normalizeLogErrorLine(rawLine)
    if (!line) {
      continue
    }

    if (!/process completed with exit code \d+\.?/i.test(line) && !/terraform exited with code \d+\.?/i.test(line)) {
      continue
    }

    const normalized = line.replace(/\s+/g, ' ').toLowerCase()
    if (unique.has(normalized)) {
      continue
    }

    unique.add(normalized)
    errors.push(line)
  }

  return errors
}

function buildAnnotationListItems(annotations: WorkflowAnnotation[], logContent?: string): AnnotationListItem[] {
  const items: AnnotationListItem[] = annotations.map((annotation) => ({
    key: [
      annotation.jobId,
      annotation.path || '',
      annotation.startLine ?? '',
      annotation.endLine ?? '',
      annotation.title || '',
      annotation.message,
    ].join('::'),
    title: annotation.title,
    message: annotation.message,
    annotationLevel: annotation.annotationLevel,
    path: annotation.path,
    startLine: annotation.startLine,
    source: 'github-annotation',
  }))

  const existingTerminalMessages = new Set(
    items.map((item) => item.message.replace(/\s+/g, ' ').toLowerCase()),
  )

  for (const message of extractTerminalErrors(logContent)) {
    const normalized = message.replace(/\s+/g, ' ').toLowerCase()
    if (existingTerminalMessages.has(normalized)) {
      continue
    }

    existingTerminalMessages.add(normalized)
    items.push({
      key: `job-error::${normalized}`,
      title: null,
      message,
      annotationLevel: 'failure',
      path: null,
      startLine: null,
      source: 'job-error',
    })
  }

  return items
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
      const workflowCommandMarker = markerMatch[3]
      const marker = bracketMarker || workflowCommandMarker
      const tail = markerMatch[4]?.trim() || ''

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

function getIsoTimestampMs(value?: string | null): number | null {
  if (!value) {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function getRawLogTimestampMs(rawLine: string): number | null {
  const matched = rawLine.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/)
  return matched ? getIsoTimestampMs(matched[1]) : null
}

function getRawLogBody(rawLine: string): string {
  return rawLine.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/, '')
}

function buildStepLogContent(step: WorkflowStep, steps: WorkflowStep[], content?: string): string {
  if (!content) {
    return ''
  }

  const rawLines = splitLogLines(content)
  const commandBoundaryIndexes = rawLines.reduce<number[]>((indexes, rawLine, index) => {
    const body = getRawLogBody(rawLine)
    if (/^##\[group\](Run |Pull down action image )/i.test(body)) {
      indexes.push(index)
    }
    return indexes
  }, [])

  if (commandBoundaryIndexes.length > 0) {
    const mainSteps = steps.filter(
      (candidate) =>
        candidate.name !== 'Set up job' &&
        !/^Post /i.test(candidate.name) &&
        candidate.name !== 'Complete job',
    )
    const mainStepIndex = mainSteps.findIndex((candidate) => candidate.number === step.number)

    if (step.name === 'Set up job') {
      const endIndex = commandBoundaryIndexes[0] ?? rawLines.length
      return rawLines.slice(0, endIndex).join('\n').trim()
    }

    if (mainStepIndex >= 0) {
      const startIndex = mainStepIndex === 0 ? 0 : (commandBoundaryIndexes[mainStepIndex] ?? 0)
      const endIndex = commandBoundaryIndexes[mainStepIndex + 1] ?? rawLines.length
      return rawLines.slice(startIndex, endIndex).join('\n').trim()
    }

    if (/^Post /i.test(step.name) || step.name === 'Complete job') {
      const postStartIndex = rawLines.findIndex((rawLine) => /Post job cleanup\./i.test(getRawLogBody(rawLine)))
      if (postStartIndex >= 0) {
        return rawLines.slice(postStartIndex).join('\n').trim()
      }
    }
  }

  const sortedSteps = [...steps].sort((left, right) => left.number - right.number)
  const stepIndex = sortedSteps.findIndex((candidate) => candidate.number === step.number)
  const nextStep = stepIndex >= 0 ? sortedSteps[stepIndex + 1] : undefined
  const stepStartMs = getIsoTimestampMs(step.startedAt)
  const stepEndMs = getIsoTimestampMs(step.completedAt)
  const nextStepStartMs = getIsoTimestampMs(nextStep?.startedAt)

  let lastIncluded = false
  const selectedLines = splitLogLines(content).filter((rawLine) => {
    const lineTimestampMs = getRawLogTimestampMs(rawLine)
    if (lineTimestampMs == null) {
      return lastIncluded
    }

    const afterStart = stepStartMs == null ? true : lineTimestampMs >= stepStartMs
    const beforeEnd = nextStepStartMs != null
      ? lineTimestampMs < nextStepStartMs
      : stepEndMs != null
        ? lineTimestampMs <= stepEndMs + 1000
        : true

    lastIncluded = afterStart && beforeEnd
    return lastIncluded
  })

  return selectedLines.join('\n').trim()
}

function normalizeCheckovLogLine(rawLine: string): string {
  return rawLine
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/, '')
    .replace(/^##\[(?:error|warning|notice)\]\s*/, '')
    .trim()
}

function normalizeCheckovPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim()
}

function parseCheckovLocation(rawValue: string): { path: string; startLine: number | null } | null {
  const matched = rawValue.match(/^(.*?):(\d+)(?:-\d+)?$/)
  if (!matched) {
    const path = normalizeCheckovPath(rawValue)
    return path ? { path, startLine: null } : null
  }

  const path = normalizeCheckovPath(matched[1])
  const startLine = Number(matched[2])

  if (!path) {
    return null
  }

  return {
    path,
    startLine: Number.isNaN(startLine) ? null : startLine,
  }
}

function parseCheckovFindings(content: string): CheckovFinding[] {
  if (!content) {
    return []
  }

  const lines = splitLogLines(content).map(normalizeCheckovLogLine)
  const findings: CheckovFinding[] = []
  const seen = new Set<string>()

  for (let index = 0; index < lines.length; index += 1) {
    const checkMatch =
      lines[index].match(/^Check:\s+([A-Z0-9_]+):\s+"(.+)"$/) ||
      lines[index].match(/^Check:\s+([A-Z0-9_]+):\s+(.+)$/)

    if (!checkMatch) {
      continue
    }

    const checkId = checkMatch[1]
    const title = checkMatch[2].trim().replace(/^"+|"+$/g, '')
    let resource: string | null = null
    let location: { path: string; startLine: number | null } | null = null
    let guide: string | null = null

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex]

      if (nextLine.startsWith('Check: ')) {
        break
      }

      const resourceMatch = nextLine.match(/^FAILED for resource:\s+(.+)$/)
      if (resourceMatch) {
        resource = resourceMatch[1].trim()
        continue
      }

      const fileMatch = nextLine.match(/^File:\s+(.+)$/)
      if (fileMatch && !location) {
        location = parseCheckovLocation(fileMatch[1])
        continue
      }

      const callingFileMatch = nextLine.match(/^Calling File:\s+(.+)$/)
      if (callingFileMatch && !location) {
        location = parseCheckovLocation(callingFileMatch[1])
        continue
      }

      const guideMatch = nextLine.match(/^Guide:\s+(.+)$/)
      if (guideMatch) {
        guide = guideMatch[1].trim()
      }
    }

    const isCustomPolicy =
      /CKV(?:2)?_CUSTOM_/i.test(checkId) ||
      !!guide?.includes('custom_policies') ||
      !!location?.path.includes('security/checkov/custom_policies')
    const key = [checkId, title, resource || '', location?.path || '', location?.startLine ?? ''].join('::')

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    findings.push({
      checkId,
      title,
      resource,
      path: location?.path || null,
      startLine: location?.startLine ?? null,
      guide,
      isCustomPolicy,
    })
  }

  return findings
}

function buildCheckovStepInsight(step: WorkflowStep, stepLog: string): CheckovStepInsight | null {
  if (step.conclusion !== 'failure' || !/checkov/i.test(step.name)) {
    return null
  }

  const findings = parseCheckovFindings(stepLog)
  const customFindings = findings.filter((finding) => finding.isCustomPolicy)
  const builtinFindings = findings.filter((finding) => !finding.isCustomPolicy)

  if (customFindings.length > 0) {
    return {
      tone: 'security',
      summary: '삽입한 Checkov 사용자 정책을 위반했습니다.',
      compactSummary: `커스텀 정책 ${customFindings.length}건 위반`,
      helperText: '아래 AI 분석 버튼으로 수정 방법을 확인하고, 제안 파일이 생성되면 바로 PR로 적용할 수 있습니다.',
      findings,
      customFindings,
      builtinFindings,
    }
  }

  return {
    tone: 'warning',
    summary: 'Checkov 자체 정책 준수 위반입니다.',
    compactSummary: `기본 Checkov 정책 ${builtinFindings.length}건 경고`,
    helperText: '기본 Checkov 정책 위반은 경고로 보고, 아래 AI 분석 버튼으로 원인과 수정 방법을 확인할 수 있습니다.',
    findings,
    customFindings,
    builtinFindings,
  }
}

function getWorkflowStepFailureTone(step: WorkflowStep, checkovInsight: CheckovStepInsight | null): StepFailureTone | undefined {
  if (step.conclusion !== 'failure') {
    return undefined
  }

  if (/gitleaks|trivy/i.test(step.name)) {
    return 'security'
  }

  if (/checkov/i.test(step.name)) {
    return checkovInsight?.tone || 'warning'
  }

  return 'warning'
}

function summarizeCheckovFindings(findings: CheckovFinding[]): AnnotationSummary[] {
  const grouped = new Map<string, AnnotationSummary>()

  for (const finding of findings) {
    const key = `${finding.checkId}::${finding.title}`
    const existing = grouped.get(key)

    if (existing) {
      existing.count += 1
      continue
    }

    grouped.set(key, {
      key,
      title: finding.checkId,
      message: finding.title,
      annotationLevel: finding.isCustomPolicy ? 'failure' : 'warning',
      count: 1,
      samplePath: finding.path,
    })
  }

  return [...grouped.values()]
}

function formatCheckovFindingDetails(finding: CheckovFinding): string | null {
  const location = finding.path
    ? `${finding.path}${finding.startLine ? `:${finding.startLine}` : ''}`
    : null

  return [location, finding.resource].filter((value): value is string => !!value).join(' / ') || null
}

function getLastStepTarget(jobs: WorkflowJob[]): StepSelection | null {
  let lastStep: { jobId: number; stepNumber: number; activityMs: number } | null = null

  for (const job of jobs) {
    for (const step of job.steps) {
      const activityMs = getIsoTimestampMs(step.completedAt) ?? getIsoTimestampMs(step.startedAt)
      if (activityMs == null) {
        continue
      }

      if (
        !lastStep ||
        activityMs > lastStep.activityMs ||
        (activityMs === lastStep.activityMs && step.number > lastStep.stepNumber)
      ) {
        lastStep = {
          jobId: job.id,
          stepNumber: step.number,
          activityMs,
        }
      }
    }
  }

  return lastStep
    ? { jobId: lastStep.jobId, stepNumber: lastStep.stepNumber }
    : null
}

function getWorkflowStepDomId(jobId: number, stepNumber: number): string {
  return `workflow-step-${jobId}-${stepNumber}`
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
  const [annotations, setAnnotations] = useState<WorkflowAnnotation[]>([])
  const [annotationsMeta, setAnnotationsMeta] = useState<WorkflowAnnotationsMeta | null>(null)
  const [expandedJobIds, setExpandedJobIds] = useState<number[]>([])
  const [selectedStepTarget, setSelectedStepTarget] = useState<StepSelection | null>(null)
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
  const [suggestionTarget, setSuggestionTarget] = useState<SuggestionTarget | null>(null)
  const [suggestionContextLabel, setSuggestionContextLabel] = useState<string | null>(null)
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
  const latestAnnotationsRequestIdRef = useRef(0)

  const selectedRun = runs.find((run) => run.id === selectedRunId) || null
  const isGithubDisconnected = !loadingStatus && (!status || !!statusError)
  const lastStepTarget = getLastStepTarget(jobs)

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId
  }, [selectedRunId])

  useEffect(() => {
    selectedWorkflowIdRef.current = selectedRun?.workflowId ?? null
  }, [selectedRun])

  useEffect(() => {
    if (!selectedStepTarget) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const element = document.getElementById(
        getWorkflowStepDomId(selectedStepTarget.jobId, selectedStepTarget.stepNumber),
      )
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)

    return () => window.clearTimeout(timeoutId)
  }, [expandedJobIds, selectedStepTarget])

  async function fetchRuns(limit = 20) {
    const response = await apiFetch<WorkflowRunsResponse>(`/api/github/runs?limit=${limit}`)
    return response.runs
  }

  function handleSelectRun(runId: number) {
    manualSelectionVersionRef.current += 1
    setSelectedRunId(runId)
  }

  async function handleSelectStep(job: WorkflowJob, step: WorkflowStep, options?: { forceOpen?: boolean }) {
    const isSameSelectedStep =
      selectedStepTarget?.jobId === job.id &&
      selectedStepTarget.stepNumber === step.number

    if (isSameSelectedStep && !options?.forceOpen) {
      setSelectedStepTarget(null)
      return
    }

    setExpandedJobIds((current) => (current.includes(job.id) ? current : [...current, job.id]))
    setSelectedStepTarget({ jobId: job.id, stepNumber: step.number })

    if (!selectedRunId) {
      return
    }

    const existingLog = logs.find((log) => log.jobId === job.id)
    if (!existingLog) {
      await loadRunLogs(selectedRunId, job.id)
    }
  }

  async function handleFocusLastStep() {
    if (!lastStepTarget) {
      return
    }

    const targetJob = jobs.find((job) => job.id === lastStepTarget.jobId)
    const targetStep = targetJob?.steps.find((step) => step.number === lastStepTarget.stepNumber)
    if (!targetJob || !targetStep) {
      return
    }

    await handleSelectStep(targetJob, targetStep, { forceOpen: true })
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

  async function loadRunLogs(runId: number, requestedJobId?: number) {
    const requestId = latestLogsRequestIdRef.current + 1
    latestLogsRequestIdRef.current = requestId

    try {
      const response = await apiFetch<WorkflowLogsResponse>(
        `/api/github/runs/${runId}/logs${requestedJobId ? `?jobId=${requestedJobId}` : ''}`,
      )
      if (latestLogsRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return []
      }

      if (requestedJobId) {
        setLogs((current) => {
          const next = new Map(current.map((log) => [log.jobId, log]))
          for (const log of response.logs) {
            next.set(log.jobId, log)
          }
          return [...next.values()]
        })
      } else {
        setLogs(response.logs)
        setExpandedJobIds((current) => (current.length > 0 ? current : response.selectedJobIds))
      }

      return response.logs
    } catch {
      if (latestLogsRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return []
      }

      if (!requestedJobId) {
        setLogs([])
      }
      return []
    }
  }

  async function loadRunAnnotations(runId: number) {
    const requestId = latestAnnotationsRequestIdRef.current + 1
    latestAnnotationsRequestIdRef.current = requestId

    try {
      const response = await apiFetch<WorkflowAnnotationsResponse>(`/api/github/runs/${runId}/annotations`)
      if (latestAnnotationsRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return []
      }

      setAnnotations(response.annotations)
      setAnnotationsMeta({
        source: response.source || 'unknown',
        rawCount: response.rawCount ?? response.annotations.length,
      })
      return response.annotations
    } catch {
      if (latestAnnotationsRequestIdRef.current !== requestId || selectedRunIdRef.current !== runId) {
        return []
      }

      setAnnotations([])
      setAnnotationsMeta(null)
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
        loadRunAnnotations(nextSelectedRun.id),
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
    setSuggestionTarget({ type: 'run' })
    setSuggestionContextLabel(null)

    try {
      const payload = await apiFetch<SuggestResponse>(`/api/github/fix-sessions/${selectedRunId}/suggest`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setSuggestion(payload)
      setActionMessage(
        payload.llmStatus === 'failed' && payload.llmError
          ? `Gemini 호출 실패로 rule-based 결과만 표시 중입니다. ${payload.llmError}`
          : payload.message,
      )
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'AI 제안 요청에 실패했습니다.')
    } finally {
      setSuggestLoading(false)
    }
  }

  async function handleSuggestAnnotations(job: WorkflowJob, annotationSummaries: AnnotationSummary[]) {
    if (!selectedRunId || annotationSummaries.length === 0) {
      return
    }

    setSuggestLoading(true)
    setActionMessage(null)
    setPrReview(null)
    setSuggestionTarget({ type: 'annotations', jobId: job.id })
    setSuggestionContextLabel(`${job.name} 대응 가이드`)

    try {
      const payload = await apiFetch<SuggestResponse>(`/api/github/fix-sessions/${selectedRunId}/suggest`, {
        method: 'POST',
        body: JSON.stringify({
          jobId: job.id,
          jobName: job.name,
          annotations: annotationSummaries.map((annotation) => ({
            title: annotation.title,
            message: annotation.message,
            path: annotation.samplePath,
            count: annotation.count,
          })),
        }),
      })
      setSuggestion(payload)
      setActionMessage(
        payload.llmStatus === 'failed' && payload.llmError
          ? `Gemini 호출 실패로 rule-based 결과만 표시 중입니다. ${payload.llmError}`
          : payload.message,
      )
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'AI 도움 요청에 실패했습니다.')
    } finally {
      setSuggestLoading(false)
    }
  }

  async function handleSuggestStep(job: WorkflowJob, step: WorkflowStep, stepLog: string, annotationSummaries: AnnotationSummary[]) {
    if (!selectedRunId || !stepLog.trim()) {
      return
    }

    setSuggestLoading(true)
    setActionMessage(null)
    setPrReview(null)
    setSuggestionTarget({ type: 'step', jobId: job.id, stepNumber: step.number })
    setSuggestionContextLabel(`${job.name} > ${step.name}`)

    try {
      const payload = await apiFetch<SuggestResponse>(`/api/github/fix-sessions/${selectedRunId}/suggest`, {
        method: 'POST',
        body: JSON.stringify({
          jobId: job.id,
          jobName: job.name,
          stepName: step.name,
          stepNumber: step.number,
          stepStatus: step.status,
          stepConclusion: step.conclusion,
          stepLog,
          annotations: step.conclusion === 'failure'
            ? annotationSummaries.map((annotation) => ({
              title: annotation.title,
              message: annotation.message,
              path: annotation.samplePath,
              count: annotation.count,
            }))
            : [],
        }),
      })

      setSuggestion(payload)
      setActionMessage(
        payload.llmStatus === 'failed' && payload.llmError
          ? `Gemini 호출 실패로 rule-based 결과만 표시 중입니다. ${payload.llmError}`
          : payload.message,
      )
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Step AI 분석 요청에 실패했습니다.')
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
      setAnnotations([])
      setAnnotationsMeta(null)
      setSelectedStepTarget(null)
      setSuggestion(null)
      setSuggestionTarget(null)
      setSuggestionContextLabel(null)
      setPrReview(null)
      setExpandedJobIds([])
      setRunSummary(null)
      return
    }

    setJobs([])
    setLogs([])
    setAnnotations([])
    setAnnotationsMeta(null)
    setSelectedStepTarget(null)
    setSuggestion(null)
    setSuggestionTarget(null)
    setSuggestionContextLabel(null)
    setPrReview(null)
    setExpandedJobIds([])
    setRunSummary(null)
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
              onClick={() => void handleFocusLastStep()}
              disabled={!lastStepTarget || executeLoading || rerunLoading}
              title="가장 마지막으로 실행된 step 위치로 이동합니다."
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <Clock3 className="h-3.5 w-3.5" />
              마지막 작업 위치
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
            annotations={annotations}
            annotationsMeta={annotationsMeta}
            expandedJobIds={expandedJobIds}
            selectedStepTarget={selectedStepTarget}
            loading={loadingDetail}
            error={detailError}
            onToggleJob={(jobId) =>
              setExpandedJobIds((current) =>
                current.includes(jobId) ? current.filter((value) => value !== jobId) : [...current, jobId],
              )
            }
            onSelectStep={(job, step) => void handleSelectStep(job, step)}
            onCopyLogs={() => void handleCopyLogs()}
            onSuggest={() => void handleSuggest()}
            onSuggestAnnotations={(job, annotationSummaries) => void handleSuggestAnnotations(job, annotationSummaries)}
            onSuggestStep={(job, step, stepLog, annotationSummaries) =>
              void handleSuggestStep(job, step, stepLog, annotationSummaries)
            }
            suggestLoading={suggestLoading}
            suggestion={suggestion}
            suggestionTarget={suggestionTarget}
            suggestionContextLabel={suggestionContextLabel}
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
                'h-full min-h-[112px] w-full rounded-xl border p-4 text-left transition-colors',
                selected
                  ? 'border-indigo-300 bg-indigo-50/70 shadow-sm'
                  : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50',
              )}
            >
              <div className="flex h-full items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start gap-2">
                    <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', presentation.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{run.name || 'Unnamed workflow'}</p>
                      <p className="mt-1 truncate text-sm leading-5 text-gray-600" title={getWorkflowDescription(run.name || '')}>
                        {getWorkflowDescription(run.name || '')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs text-gray-400">
                    <span>{formatRelativeTime(run.createdAt)}</span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      <span>{formatDuration(run.createdAt, run.updatedAt)}</span>
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'inline-flex h-6 min-w-[56px] items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none',
                    presentation.badge,
                  )}
                >
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
  annotations: WorkflowAnnotation[]
  annotationsMeta: WorkflowAnnotationsMeta | null
  expandedJobIds: number[]
  selectedStepTarget: StepSelection | null
  loading: boolean
  error: string | null
  onToggleJob: (jobId: number) => void
  onSelectStep: (job: WorkflowJob, step: WorkflowStep) => void
  onCopyLogs: () => void
  onSuggest: () => void
  onSuggestAnnotations: (job: WorkflowJob, annotationSummaries: AnnotationSummary[]) => void
  onSuggestStep: (job: WorkflowJob, step: WorkflowStep, stepLog: string, annotationSummaries: AnnotationSummary[]) => void
  suggestLoading: boolean
  suggestion: SuggestResponse | null
  suggestionTarget: SuggestionTarget | null
  suggestionContextLabel: string | null
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
  annotations,
  annotationsMeta,
  expandedJobIds,
  selectedStepTarget,
  loading,
  error,
  onToggleJob,
  onSelectStep,
  onCopyLogs,
  onSuggest,
  onSuggestAnnotations,
  onSuggestStep,
  suggestLoading,
  suggestion,
  suggestionTarget,
  suggestionContextLabel,
  runSummary,
  onApply,
  applyLoading,
  prReview,
  onMergePr,
  onClosePr,
  prActionLoading,
}: RunDetailProps) {
  const logByJobId = new Map(logs.map((log) => [log.jobId, log]))
  const annotationsByJobId = new Map<number, WorkflowAnnotation[]>(
    jobs.map((job) => [job.id, annotations.filter((annotation) => annotation.jobId === job.id)]),
  )
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
              {annotationsMeta && annotationsMeta.rawCount > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-amber-700">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium">
                    {annotationsMeta.source === 'github-api' ? 'GitHub API' : 'Annotations'}
                  </span>
                  <span>run 원본 annotation {annotationsMeta.rawCount}개</span>
                </div>
              )}
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

        {suggestion && (suggestionTarget?.type !== 'step' || !!prReview || !!suggestion.suggestedFiles?.length) && (
          <div className="mb-4 space-y-3">
            {/* AI 분석 메인 카드 */}
            {suggestionTarget?.type !== 'step' && (
              <SuggestionInsightCard
                suggestion={suggestion}
                label={suggestionContextLabel || 'AI 에러 분석'}
              />
            )}

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
            const jobAnnotations = annotationsByJobId.get(job.id) || []
            const jobAnnotationItems = buildAnnotationListItems(jobAnnotations, log?.content)
            const jobAnnotationSummaries = summarizeAnnotations(jobAnnotationItems)
            const jobSummary = summaryByJobId.get(job.id)
            const tone = getStepTone(job.conclusion, job.status)
            const expanded = expandedJobIds.includes(job.id)
            const logExpanded = expandedLogJobIds.includes(job.id)
            const timelineSteps = job.steps.map((step) => {
              const summaryStep = jobSummary?.steps.find((candidate) => candidate.number === step.number)
              const checkovStepLog =
                step.conclusion === 'failure' && /checkov/i.test(step.name)
                  ? buildStepLogContent(step, job.steps, log?.content)
                  : ''
              const checkovInsight = buildCheckovStepInsight(step, checkovStepLog)

              return {
                name: step.name,
                number: step.number,
                status: step.status,
                conclusion: step.conclusion,
                failureTone: getWorkflowStepFailureTone(step, checkovInsight) ?? null,
                startedAt: step.startedAt,
                completedAt: step.completedAt,
                summary: checkovInsight?.compactSummary || summaryStep?.summary,
                durationSeconds: summaryStep?.durationSeconds ?? null,
              }
            })
            const selectedStep =
              selectedStepTarget?.jobId === job.id
                ? job.steps.find((step) => step.number === selectedStepTarget.stepNumber) || null
                : null
            const selectedStepLog = selectedStep ? buildStepLogContent(selectedStep, job.steps, log?.content) : ''
            const selectedStepCheckovInsight = selectedStep ? buildCheckovStepInsight(selectedStep, selectedStepLog) : null
            const selectedStepAnnotationSummaries =
              selectedStepCheckovInsight && selectedStepCheckovInsight.findings.length > 0
                ? summarizeCheckovFindings(selectedStepCheckovInsight.findings)
                : jobAnnotationSummaries
            const selectedStepSuggestion =
              selectedStep &&
              suggestion &&
              suggestionTarget?.type === 'step' &&
              suggestionTarget.jobId === job.id &&
              suggestionTarget.stepNumber === selectedStep.number
                ? suggestion
                : null

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

                    {/* Step Timeline with details */}
                    {timelineSteps.length > 0 ? (
                      <div className="border-t border-gray-100 bg-white">
                        <StepTimeline
                          steps={timelineSteps}
                          activeStepNumber={selectedStep?.number ?? null}
                          onStepClick={(step) => {
                            const targetStep = job.steps.find((candidate) => candidate.number === step.number)
                            if (targetStep) {
                              void onSelectStep(job, targetStep)
                            }
                          }}
                          stepDomIdPrefix={getWorkflowStepDomId(job.id, 0).replace(/-0$/, '')}
                          renderExpandedContent={(step) => {
                            if (!selectedStep || selectedStep.number !== step.number) {
                              return null
                            }

                            const expandedStep = selectedStep

                            return (
                              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
                                {selectedStepCheckovInsight && (
                                  <div className="border-b border-slate-200 px-4 py-4">
                                    <CheckovStepInsightCard insight={selectedStepCheckovInsight} />
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                      Step Logs
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-slate-900">
                                      {job.name} &gt; {expandedStep.name}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {selectedStepLog
                                        ? `${parseLogLines(selectedStepLog).length} log lines`
                                        : '이 step에 매칭되는 로그를 찾지 못했습니다.'}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSuggestStep(job, expandedStep, selectedStepLog, selectedStepAnnotationSummaries)
                                    }
                                    disabled={suggestLoading || !selectedStepLog}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    {suggestLoading ? 'AI 분석중...' : '이 단계 AI 분석'}
                                  </button>
                                </div>
                                {selectedStepSuggestion && (
                                  <div className="border-b border-slate-200 px-4 py-4">
                                    <SuggestionInsightCard
                                      suggestion={selectedStepSuggestion}
                                      label={suggestionContextLabel || `${job.name} > ${expandedStep.name}`}
                                    />
                                  </div>
                                )}
                                {selectedStepSuggestion?.suggestedFiles && selectedStepSuggestion.suggestedFiles.length > 0 && (
                                  <div className="border-b border-slate-200 px-4 py-4">
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                          <FileCode className="h-4 w-4 text-emerald-600" />
                                          <div>
                                            <p className="text-sm font-medium text-emerald-800">
                                              AI가 수정 파일 {selectedStepSuggestion.suggestedFiles.length}개를 제안했습니다.
                                            </p>
                                            <p className="mt-1 text-xs text-emerald-700">
                                              이 단계에서 바로 PR을 생성해 적용할 수 있습니다.
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={onApply}
                                          disabled={applyLoading || !!prReview}
                                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <GitPullRequest className="h-3.5 w-3.5" />
                                          {applyLoading ? 'PR 생성 중...' : prReview ? 'PR 생성됨' : '적용 (PR 생성)'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {selectedStepLog ? (
                                  <LogViewer jobId={job.id} content={selectedStepLog} />
                                ) : (
                                  <div className="px-4 py-6 text-sm text-slate-500">
                                    현재 step과 연결된 로그 구간을 찾지 못했습니다.
                                  </div>
                                )}
                              </div>
                            )
                          }}
                        />
                      </div>
                    ) : null}

                    {jobAnnotationItems.length > 0 && (
                      <div className="border-t border-gray-100 bg-amber-50/40 px-4 py-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Annotations</p>
                            <p className="mt-1 text-xs text-amber-600">
                              {jobAnnotationItems.length} errors
                              {jobAnnotationSummaries.length > 0 ? `, AI uses ${jobAnnotationSummaries.length} grouped items` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {jobAnnotations.length === 0 && (
                              <span className="rounded-full bg-white px-2 py-1 text-[11px] text-amber-700">
                                log-derived terminal errors
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => onSuggestAnnotations(job, jobAnnotationSummaries)}
                              disabled={suggestLoading || jobAnnotationSummaries.length === 0}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {suggestLoading ? 'AI 분석중...' : 'AI 도움 받기'}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {jobAnnotationItems.map((annotation) => {
                            const presentation = getAnnotationPresentation(annotation.annotationLevel)

                            return (
                              <div key={`${job.id}-annotation-${annotation.key}`} className="rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs text-gray-500">{job.name}</p>
                                    <p className="mt-1 text-sm leading-5 text-gray-800">
                                      {annotation.title ? `${annotation.title}: "${annotation.message}"` : annotation.message}
                                    </p>
                                  </div>
                                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', presentation.badge)}>
                                    {presentation.label}
                                  </span>
                                </div>
                                {(annotation.path || annotation.startLine || annotation.source === 'job-error') && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                    {annotation.source === 'job-error' && <span>job terminal error</span>}
                                    {annotation.path && (
                                      <span>
                                        {annotation.path}
                                        {annotation.startLine ? `:${annotation.startLine}` : ''}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Log toggle */}
                    <div className="hidden border-t border-gray-100">
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
  const parsedLines = parseLogLines(content).filter(
    (line) => !(line.tone === 'muted' && line.message === 'End group'),
  )

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white font-mono text-xs shadow-sm">
      <div className="grid grid-cols-[56px_minmax(0,1fr)] border-b border-gray-200 bg-[#f6f8fa] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
        <span>Line</span>
        <span>Log</span>
      </div>
      <div className="max-h-[560px] overflow-auto bg-white">
        {parsedLines.map((line) => (
          <div
            key={`${jobId}-line-${line.lineNumber}`}
            className="grid grid-cols-[56px_minmax(0,1fr)] border-b border-gray-100 px-3 py-1.5 last:border-b-0 even:bg-[#f6f8fa]"
          >
            <div className="select-none pr-2 text-right text-[11px] text-gray-400">{line.lineNumber}</div>
            <div
              className={`min-w-0 whitespace-pre-wrap break-words py-0.5 ${getLogToneClass(line.tone)}`}
              style={{ paddingLeft: `${line.indentLevel * 16}px` }}
            >
              {line.tone === 'group' ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  <span>{line.message || 'Group'}</span>
                </span>
              ) : (
                line.message || ' '
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface InsightSection {
  title: string | null
  bullets: string[]
  paragraphs: string[]
}

function normalizeInsightText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}

function parseInsightSections(text: string): InsightSection[] {
  const lines = normalizeInsightText(text).split('\n')
  const sections: InsightSection[] = []
  let current: InsightSection = { title: null, bullets: [], paragraphs: [] }
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    const paragraph = paragraphBuffer.join(' ').trim()
    if (paragraph) {
      current.paragraphs.push(paragraph)
    }
    paragraphBuffer = []
  }

  const flushSection = () => {
    flushParagraph()
    if (current.title || current.bullets.length > 0 || current.paragraphs.length > 0) {
      sections.push(current)
    }
    current = { title: null, bullets: [], paragraphs: [] }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      continue
    }

    if (/^#{1,6}\s+/.test(line) || /^\[[^\]]+\]$/.test(line)) {
      flushSection()
      current.title = line.replace(/^#{1,6}\s+/, '').replace(/^\[(.+)\]$/, '$1').trim()
      continue
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      flushParagraph()
      current.bullets.push(line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
      continue
    }

    paragraphBuffer.push(line)
  }

  flushSection()
  return sections
}

function InsightBody({ text }: { text: string }) {
  const sections = parseInsightSections(text)

  if (sections.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 p-3 text-sm leading-6 text-amber-950 whitespace-pre-wrap">
        {text}
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {sections.map((section, index) => (
        <div key={`${section.title || 'section'}-${index}`} className="rounded-lg border border-amber-200 bg-white/70 p-3">
          {section.title && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
              {section.title}
            </p>
          )}
          {section.paragraphs.length > 0 && (
            <div className={cn('space-y-2 text-sm leading-6 text-amber-950', section.title && 'mt-2')}>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${index}-paragraph-${paragraphIndex}`}>{paragraph}</p>
              ))}
            </div>
          )}
          {section.bullets.length > 0 && (
            <div className={cn('space-y-2 text-sm leading-6 text-amber-950', section.title && 'mt-2')}>
              {section.bullets.map((bullet, bulletIndex) => (
                <div key={`${index}-bullet-${bulletIndex}`} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <p>{bullet}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CheckovStepInsightCard({ insight }: { insight: CheckovStepInsight }) {
  const visibleCustomFindings = insight.customFindings.slice(0, 6)
  const visibleBuiltinFindings = insight.builtinFindings.slice(0, 3)
  const toneStyles =
    insight.tone === 'security'
      ? {
        container: 'border-red-200 bg-red-50 text-red-900',
        badge: 'bg-red-100 text-red-700',
        title: 'text-red-800',
        body: 'text-red-700',
        divider: 'border-red-200',
        item: 'border-red-200 bg-white/70',
      }
      : {
        container: 'border-amber-200 bg-amber-50 text-amber-900',
        badge: 'bg-amber-100 text-amber-700',
        title: 'text-amber-800',
        body: 'text-amber-700',
        divider: 'border-amber-200',
        item: 'border-amber-200 bg-white/70',
      }

  return (
    <div className={cn('rounded-xl border px-4 py-3', toneStyles.container)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className={cn('text-sm font-semibold', toneStyles.title)}>{insight.summary}</p>
            <p className={cn('mt-1 text-xs leading-5', toneStyles.body)}>{insight.helperText}</p>
            <p className={cn('mt-2 text-xs font-medium', toneStyles.body)}>{insight.compactSummary}</p>
          </div>
        </div>
        <span className={cn('rounded-full px-2 py-1 text-[11px] font-medium', toneStyles.badge)}>
          {insight.tone === 'security' ? 'custom policy' : 'checkov warning'}
        </span>
      </div>

      {insight.tone === 'security' && visibleCustomFindings.length > 0 && (
        <div className={cn('mt-3 space-y-2 border-t pt-3', toneStyles.divider)}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Violated Policies</p>
          {visibleCustomFindings.map((finding) => {
            const details = formatCheckovFindingDetails(finding)

            return (
              <div
                key={`${finding.checkId}-${finding.path || finding.resource || finding.title}`}
                className={cn('rounded-lg border px-3 py-2', toneStyles.item)}
              >
                <p className="text-sm font-medium text-red-900">
                  {finding.title} <span className="text-xs font-normal text-red-600">({finding.checkId})</span>
                </p>
                {details && <p className="mt-1 text-xs text-red-700">{details}</p>}
                {finding.guide && (
                  <p className="mt-1 break-all text-[11px] text-red-600">{finding.guide}</p>
                )}
              </div>
            )
          })}
          {insight.customFindings.length > visibleCustomFindings.length && (
            <p className="text-xs text-red-700">
              외 {insight.customFindings.length - visibleCustomFindings.length}개 정책 위반이 더 있습니다.
            </p>
          )}
        </div>
      )}

      {insight.tone === 'warning' && insight.builtinFindings.length > 0 && (
        <div className={cn('mt-3 space-y-2 border-t pt-3', toneStyles.divider)}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Detected Checks</p>
          {visibleBuiltinFindings.map((finding) => {
            const details = formatCheckovFindingDetails(finding)

            return (
              <div
                key={`${finding.checkId}-${finding.path || finding.resource || finding.title}`}
                className={cn('rounded-lg border px-3 py-2', toneStyles.item)}
              >
                <p className="text-sm font-medium text-amber-900">
                  {finding.title} <span className="text-xs font-normal text-amber-700">({finding.checkId})</span>
                </p>
                {details && <p className="mt-1 text-xs text-amber-700">{details}</p>}
              </div>
            )
          })}
          {insight.builtinFindings.length > visibleBuiltinFindings.length && (
            <p className="text-xs text-amber-700">
              외 {insight.builtinFindings.length - visibleBuiltinFindings.length}개 기본 정책 경고가 더 있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function SuggestionInsightCard({
  suggestion,
  label,
}: {
  suggestion: SuggestResponse
  label: string
}) {
  const detailLabel = suggestion.analysisKind === 'informational' ? '설명' : '원인'
  const nextLabel = suggestion.analysisKind === 'informational' ? '확인 포인트' : '다음 조치'

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="font-medium">
            {label}
            {suggestion.llmStatus === 'success' && (
              <span className="ml-2 rounded bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-normal uppercase">
                LLM + Rule
              </span>
            )}
            {suggestion.llmStatus === 'failed' && (
              <span className="ml-2 rounded bg-red-200/70 px-1.5 py-0.5 text-[10px] font-normal uppercase text-red-800">
                Rule fallback
              </span>
            )}
            {suggestion.llmStatus === 'not_attempted' && (
              <span className="ml-2 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-normal uppercase text-slate-700">
                Rule only
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-amber-500">
          {suggestion.mode && <span>모드: {suggestion.mode}</span>}
          {suggestion.configuredModel && <span>{suggestion.configuredModel}</span>}
        </div>
      </div>

      {suggestion.llmError && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <p className="font-medium">Gemini 호출 실패로 rule-based 결과만 표시 중입니다.</p>
          <p className="mt-1">{suggestion.llmError}</p>
        </div>
      )}

      {suggestion.llmAnalysis && (
        <InsightBody text={suggestion.llmAnalysis} />
      )}

      {!suggestion.llmAnalysis && suggestion.summary && (
        <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
          <SuggestionRow label="요약" value={suggestion.summary} />
          {suggestion.rootCause && <SuggestionRow label={detailLabel} value={suggestion.rootCause} />}
          {suggestion.analysisKind !== 'informational' && suggestion.riskLevel && (
            <SuggestionRow label="위험도" value={suggestion.riskLevel} />
          )}
          {suggestion.nextActions && suggestion.nextActions.length > 0 && (
            <SuggestionList
              label={nextLabel}
              items={suggestion.nextActions}
              getKey={(item) => item}
              renderItem={(item) => item}
            />
          )}
        </div>
      )}
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
