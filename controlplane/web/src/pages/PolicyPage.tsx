import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/Header'
import ChartCard from '@/components/common/ChartCard'
import { type PolicyStatus, type PolicyTemplate } from '@/data/mockData'
import { API_BASE_URL } from '@/lib/env'

type ProviderLabel = 'gemini' | 'fallback'
type PolicyOrigin = 'llm' | 'fallback'
type PolicySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface GeneratedPolicyItem {
  sourcePolicyId?: string
  sourcePolicyTitle?: string
  sourceExcerpt?: string
  origin: PolicyOrigin
  policyName: string
  description: string
  summary: string
  category: string
  severity: PolicySeverity
  targetProvider: string
  policyId: string
  policyPath: string
  yaml: string
}

interface StoredPolicy extends PolicyTemplate {
  policyPath: string
  provider: ProviderLabel
  origin: PolicyOrigin
  policyId: string
  category: string
  severity: PolicySeverity
  targetProvider: string
  createdAt: string
  sourcePolicyId?: string
  sourcePolicyTitle?: string
}

interface ApiErrorPayload {
  error?: string
  message?: string
}

interface GeneratedPolicyResponse {
  ok: boolean
  mode: 'llm' | 'fallback'
  provider: ProviderLabel
  llmError?: string
  fileName: string
  summary: string
  policyCount: number
  policies: GeneratedPolicyItem[]
  skippedPolicies?: Array<{
    sourcePolicyId: string
    sourcePolicyTitle: string
    reason: string
  }>
}

interface RegistryPoliciesResponse {
  ok: boolean
  policies: StoredPolicy[]
}

interface RegistryPolicyResponse {
  ok: boolean
  policy: StoredPolicy
}

interface ApplyPolicyResponse {
  ok: boolean
  policyPaths: string[]
  fileCount: number
  branchName: string
  commitSha: string
}

interface DeletePolicyResponse {
  ok: boolean
  deleted: boolean
  githubFileDeleted: boolean
  branchName?: string
  commitSha?: string
}

const legacyPolicyStatusStyles: Record<PolicyStatus, { label: string; className: string }> = {
  active: { label: '활성', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  draft: { label: '초안', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  paused: { label: '중지', className: 'border-slate-200 bg-slate-100 text-slate-600' },
}

const legacyPolicyStatusStyles2: Record<PolicyStatus, { label: string; className: string }> = {
  active: { label: '활성', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  draft: { label: '초안', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  paused: { label: '중지', className: 'border-slate-200 bg-slate-100 text-slate-600' },
}

const policyStatusStyles: Record<PolicyStatus, { label: string; className: string }> = {
  active: { label: '활성', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  draft: { label: '초안', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  paused: { label: '중지', className: 'border-slate-200 bg-slate-100 text-slate-600' },
}
void legacyPolicyStatusStyles
void legacyPolicyStatusStyles2
void policyStatusStyles

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

    if (text.trim()) {
      throw new Error(text.trim())
    }

    throw new Error(`Request failed with HTTP ${response.status}`)
  }

  if (!data) {
    throw new Error(`API returned an empty response for ${path}`)
  }

  return data as T
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatTimestamp() {
  return new Date().toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTimestampMs(value?: string | null) {
  if (!value) {
    return null
  }

  const timestampMs = new Date(value).getTime()
  return Number.isNaN(timestampMs) ? null : timestampMs
}

function formatHeaderTimestamp(value?: string | null) {
  if (!value) {
    return undefined
  }

  const timestampMs = getTimestampMs(value)
  if (timestampMs == null) {
    return value
  }

  return new Date(timestampMs).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getLastPolicyInsertedAt(policies: StoredPolicy[]) {
  if (policies.length === 0) {
    return undefined
  }

  let latestPolicy = policies[0]
  let latestValue = latestPolicy.createdAt || latestPolicy.lastUpdated
  let latestTimestampMs = getTimestampMs(latestValue)

  for (const policy of policies.slice(1)) {
    const currentValue = policy.createdAt || policy.lastUpdated
    const currentTimestampMs = getTimestampMs(currentValue)
    if (currentTimestampMs == null) {
      continue
    }

    if (latestTimestampMs == null || currentTimestampMs > latestTimestampMs) {
      latestPolicy = policy
      latestValue = currentValue
      latestTimestampMs = currentTimestampMs
    }
  }

  return formatHeaderTimestamp(latestValue)
}

function getSeverityTone(severity: PolicySeverity) {
  switch (severity) {
    case 'CRITICAL':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'HIGH':
      return 'border-orange-200 bg-orange-50 text-orange-700'
    case 'MEDIUM':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'LOW':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    default:
      return 'border-gray-200 bg-gray-50 text-gray-700'
  }
}
void getSeverityTone

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const base64 = result.split(',')[1]

      if (!base64) {
        reject(new Error('PDF 인코딩에 실패했습니다.'))
        return
      }

      resolve(base64)
    }

    reader.onerror = () => {
      reject(new Error('PDF 파일을 읽지 못했습니다.'))
    }

    reader.readAsDataURL(file)
  })
}

function buildStoredPolicy(
  sourceFileName: string,
  policy: GeneratedPolicyItem,
  provider: ProviderLabel,
): StoredPolicy {
  const createdAt = new Date().toISOString()
  const generatedPolicyName = getGeneratedPolicyDisplayName(policy)

  const storedPolicy: StoredPolicy = {
    id: `policy-${Date.now()}-${policy.policyId}`,
    name: generatedPolicyName,
    description: policy.description,
    source: sourceFileName,
    checks: 1,
    createdAt,
    status: 'draft',
    lastUpdated: formatTimestamp(),
    yaml: policy.yaml,
    policyPath: policy.policyPath,
    provider,
    origin: policy.origin as PolicyOrigin,
    policyId: policy.policyId,
    category: policy.category,
    severity: policy.severity,
    targetProvider: policy.targetProvider,
    sourcePolicyId: policy.sourcePolicyId,
    sourcePolicyTitle: policy.sourcePolicyTitle,
  }

  return storedPolicy
}

function formatSourcePolicyKey(value?: string | null) {
  if (!value) {
    return null
  }

  return value.trim().toUpperCase().replace(/-/g, '_')
}

function getGeneratedPolicyDisplayName(policy: GeneratedPolicyItem) {
  const sourceKey = formatSourcePolicyKey(policy.sourcePolicyId)
  return sourceKey ? `custom_policy_${sourceKey}` : policy.policyName
}

function getPreviewPolicyTitle(policy: GeneratedPolicyItem) {
  return getGeneratedPolicyDisplayName(policy)
}

function normalizePreviewText(text: string) {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const previewSectionLabels = [
  '점검 내용',
  '점검 목적',
  '개요',
  '보안 위협',
  '조치 방법',
  '진단 기준',
] as const

const previewSectionBoundaries = [
  ...previewSectionLabels,
  '참고',
  '점검 대상 및 진단 기준',
  '대상',
  '양호',
  '취약',
  '조치 영향',
  '점검 및 조치 여부',
] as const

function extractPreviewSection(text: string, label: string) {
  const boundaryPattern = previewSectionBoundaries
    .filter((candidate) => candidate !== label)
    .map((candidate) => escapeRegExp(candidate))
    .join('|')

  const regex = new RegExp(
    `${escapeRegExp(label)}\\s*[:竊?]?\\s*(.+?)(?=\\s*(?:${boundaryPattern})\\s*(?:[:竊?]|$)|$)`,
    'i',
  )
  const matched = text.match(regex)
  if (!matched?.[1]) {
    return null
  }

  return normalizePreviewText(matched[1])
}

function getPreviewExcerpt(text: string) {
  const normalized = normalizePreviewText(text)
  if (!normalized) {
    return ''
  }

  for (const label of previewSectionLabels) {
    const section = extractPreviewSection(normalized, label)
    if (section) {
      return `${label}: ${section}`
    }
  }

  return normalized
}

function cleanDisplayDescription(text: string) {
  const normalized = normalizePreviewText(text)
    .replace(/^(점검 내용|점검 목적|보안 위협|조치 방법|진단 기준|판단 기준|중요도)\s*[:：]?\s*/i, '')
    .trim()

  return normalized.length > 120 ? `${normalized.slice(0, 117).trimEnd()}...` : normalized
}

function getDisplayDescription(policy: GeneratedPolicyItem | StoredPolicy) {
  const description = cleanDisplayDescription(policy.description)
  if (description) {
    return description
  }

  const sourceExcerpt = 'sourceExcerpt' in policy && typeof policy.sourceExcerpt === 'string'
    ? policy.sourceExcerpt
    : ''

  return sourceExcerpt ? getPreviewExcerpt(sourceExcerpt) : description
}

function getOriginTone(origin: PolicyOrigin) {
  return origin === 'llm'
    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
    : 'border-amber-200 bg-amber-50 text-amber-700'
}

function getOriginLabel(origin: PolicyOrigin) {
  return `origin: ${origin}`
}

function formatPolicyGenerationErrors(errorMessage: string) {
  const grouped = new Map<
    string,
    {
      sourcePolicyId: string | null
      missingSeverity: boolean
      missingResourceTypes: boolean
      messages: string[]
    }
  >()

  for (const rawPart of errorMessage.split(/\s+\|\s+/).map((part) => part.trim()).filter(Boolean)) {
    const match = rawPart.match(/^([A-Z]+-\d+(?:-\d+)?)\s*:\s*(.+)$/i)
    const sourcePolicyId = match?.[1]?.toUpperCase() || null
    const detail = match?.[2] || rawPart
    const key = sourcePolicyId || '__global__'
    const current = grouped.get(key) || {
      sourcePolicyId,
      missingSeverity: false,
      missingResourceTypes: false,
      messages: [],
    }

    if (/metadata\.severity is missing from YAML/i.test(detail)) {
      current.missingSeverity = true
    } else if (/definition\.resource_types is missing from YAML/i.test(detail)) {
      current.missingResourceTypes = true
    } else if (/Gemini is not configured/i.test(detail)) {
      current.messages.push('LLM API 키가 설정되지 않았습니다.')
    } else if (/Gemini returned no usable content/i.test(detail)) {
      current.messages.push(`${sourcePolicyId ? `${sourcePolicyId} 정책에서 ` : ''}LLM이 사용할 수 있는 정책 결과를 반환하지 않았습니다.`)
    } else {
      current.messages.push(detail)
    }

    grouped.set(key, current)
  }

  const messages: string[] = []

  for (const group of grouped.values()) {
    const prefix = group.sourcePolicyId ? `${group.sourcePolicyId} 정책에서 ` : ''

    if (group.missingSeverity && group.missingResourceTypes) {
      messages.push(`${prefix}필수 severity와 definition.resource_types가 모두 비어 있어 유효한 Checkov 정책을 만들 수 없습니다.`)
      continue
    }

    if (group.missingSeverity) {
      messages.push(`${prefix}severity 값이 비어 있어 Checkov 정책으로 사용할 수 없습니다.`)
    }

    if (group.missingResourceTypes) {
      messages.push(`${prefix}검사 대상 Terraform resource_types가 비어 있어 어떤 리소스를 검사할지 결정할 수 없습니다.`)
    }

    messages.push(...group.messages)
  }

  return messages
}

function BatchPreviewList({
  policies,
  openId,
  copiedId,
  createdPolicyIds,
  onToggleOpen,
  onCopyYaml,
  onCreatePolicy,
}: {
  policies: GeneratedPolicyItem[]
  openId: string | null
  copiedId: string | null
  createdPolicyIds: string[]
  onToggleOpen: (policyId: string) => void
  onCopyYaml: (policy: GeneratedPolicyItem) => void
  onCreatePolicy: (policy: GeneratedPolicyItem) => void
}) {
  return (
    <div className="space-y-4">
      {policies.map((policy) => {
        const isOpen = openId === policy.policyId
        const isCreated = createdPolicyIds.includes(policy.policyId)

        return (
          <div key={policy.policyId} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{getPreviewPolicyTitle(policy)}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">
                  {getDisplayDescription(policy)}
                </p>
                {policy.summary && (
                  <p className="mt-2 text-xs leading-5 text-gray-500">{policy.summary}</p>
                )}
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                {formatSourcePolicyKey(policy.sourcePolicyId) && (
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">
                    {formatSourcePolicyKey(policy.sourcePolicyId)}
                  </span>
                )}
                <span className={`rounded-full border px-2.5 py-1 text-xs ${getOriginTone(policy.origin)}`}>
                  {getOriginLabel(policy.origin)}
                </span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                  {policy.severity}
                </span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                  provider: {policy.targetProvider}
                </span>
              </div>

              {isOpen && (
                <pre className="max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 shadow-inner">
                  {policy.yaml}
                </pre>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onToggleOpen(policy.policyId)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {isOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {isOpen ? 'YAML 닫기' : 'YAML 보기'}
                </button>
                <button
                  onClick={() => onCopyYaml(policy)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {copiedId === policy.policyId ? <Check className="h-3.5 w-3.5 text-indigo-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === policy.policyId ? '복사됨' : 'YAML 복사'}
                </button>
                <button
                  onClick={() => onCreatePolicy(policy)}
                  disabled={isCreated}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCreated ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FilePlus className="h-3.5 w-3.5" />}
                  {isCreated ? '목록 추가됨' : '정책 목록 추가'}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PolicyUploadCard({
  onCreate,
}: {
  onCreate: (policies: StoredPolicy[]) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<GeneratedPolicyResponse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [createdPolicyIds, setCreatedPolicyIds] = useState<string[]>([])
  const [copiedPolicyId, setCopiedPolicyId] = useState<string | null>(null)
  const [openPreviewId, setOpenPreviewId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyzeFile = async (file: File) => {
    setGenerating(true)
    setCreatedPolicyIds([])
    setCopiedPolicyId(null)
    setOpenPreviewId(null)
    setPreview(null)
    setError(null)

    try {
      const contentBase64 = await fileToBase64(file)
      const result = await apiFetch<GeneratedPolicyResponse>('/api/policies/generate', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          contentBase64,
        }),
      })

      setPreview(result)
      setOpenPreviewId(result.policies[0]?.policyId || null)
    } catch (err) {
      const message = err instanceof Error ? err.message : '정책 생성에 실패했습니다.'
      setError(message)
    } finally {
      setGenerating(false)
    }
  }

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF 파일만 업로드할 수 있습니다.')
      return
    }

    setSelectedFile(file)
    void analyzeFile(file)
  }

  const handleReset = () => {
    setSelectedFile(null)
    setPreview(null)
    setGenerating(false)
    setCreatedPolicyIds([])
    setCopiedPolicyId(null)
    setOpenPreviewId(null)
    setError(null)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleCopyYaml = async (policy: GeneratedPolicyItem) => {
    try {
      await navigator.clipboard.writeText(policy.yaml)
      setCopiedPolicyId(policy.policyId)
      window.setTimeout(() => setCopiedPolicyId(null), 1500)
    } catch {
      setCopiedPolicyId(null)
    }
  }

  const handleCreatePolicy = async (policy: GeneratedPolicyItem) => {
    if (!selectedFile || !preview) return

    try {
      await onCreate([buildStoredPolicy(selectedFile.name, policy, preview.provider)])
      setCreatedPolicyIds((current) => (current.includes(policy.policyId) ? current : [...current, policy.policyId]))
    } catch (err) {
      const message = err instanceof Error ? err.message : '정책 목록에 추가하지 못했습니다.'
      setError(message)
    }
  }

  return (
    <ChartCard
      title="PDF 정책 분석"
      showActions={false}
    >
      <div className="space-y-4">
        {!selectedFile && (
          <div
            onDrop={(event) => {
              event.preventDefault()
              setDragOver(false)
              const file = event.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-indigo-50/50'}`}
          >
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border ${dragOver ? 'border-indigo-200 bg-indigo-100' : 'border-gray-200 bg-gray-100'}`}
            >
              <Upload className={`h-7 w-7 ${dragOver ? 'text-indigo-600' : 'text-gray-400'}`} />
            </div>
            <p className="text-base font-medium text-gray-800">PDF를 드래그하거나 클릭해서 업로드</p>
            <p className="mt-1 text-sm text-gray-500">PDF 내용을 분석해 정책 초안과 YAML 결과를 미리 확인합니다.</p>
            <span className="mt-4 inline-flex rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
              파일 선택
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </div>
        )}

        {selectedFile && (
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50">
              <FileText className="h-4.5 w-4.5 text-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">{selectedFile.name}</p>
              <p className="mt-0.5 text-xs text-gray-500">{formatFileSize(selectedFile.size)} · PDF</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void analyzeFile(selectedFile)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                다시 분석
              </button>
              <button
                onClick={handleReset}
                className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {generating && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
              <Sparkles className="h-4 w-4" />
              <span>정책 생성 중</span>
            </div>
            <p className="mt-1 text-xs text-indigo-600/80">원문 정책을 분해하고 YAML 초안을 만드는 중입니다.</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-700">작업 실패</p>
                <p className="mt-1 text-xs text-red-600">{error}</p>
              </div>
            </div>
          </div>
        )}

        {preview && !generating && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                <p className="text-sm font-medium text-indigo-700">Checkov custom policy 생성 완료</p>
              </div>
              <span className="rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                생성 {preview.policyCount}건
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[128px_128px_minmax(0,1fr)]">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-center">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Generated</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{preview.policyCount}</p>
                <p className="mt-1 text-xs text-gray-500">생성된 정책</p>
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-center">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Skipped</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{preview.skippedPolicies?.length || 0}</p>
                <p className="mt-1 text-xs text-gray-500">건너뛴 정책</p>
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-center">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Source File</p>
                <p className="mt-1 break-all text-sm font-medium text-gray-900">{preview.fileName}</p>
                <p className="mt-1 text-xs text-gray-500">업로드한 문서</p>
              </div>
            </div>

            {preview.llmError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800">
                  {preview.policyCount > 0
                    ? '일부 정책 생성 결과를 검증하지 못했습니다.'
                    : 'LLM 생성 중 오류가 있었습니다.'}
                </p>
                <div className="mt-2 space-y-1 text-xs text-amber-700">
                  {formatPolicyGenerationErrors(preview.llmError).map((message, index) => (
                    <p key={`${index}-${message}`}>{message}</p>
                  ))}
                </div>
              </div>
            )}

            {preview.skippedPolicies && preview.skippedPolicies.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">
                  YAML로 만들지 않은 원문 정책 {preview.skippedPolicies.length}건
                </p>
                <div className="mt-2 space-y-2 text-xs text-gray-600">
                  {preview.skippedPolicies.map((item) => (
                    <p key={`${item.sourcePolicyId}-${item.sourcePolicyTitle}`}>
                      {item.sourcePolicyId} / {item.sourcePolicyTitle}: {item.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <BatchPreviewList
              policies={preview.policies}
              openId={openPreviewId}
              copiedId={copiedPolicyId}
              createdPolicyIds={createdPolicyIds}
              onToggleOpen={(policyId) => setOpenPreviewId((current) => (current === policyId ? null : policyId))}
              onCopyYaml={(policy) => void handleCopyYaml(policy)}
              onCreatePolicy={(policy) => void handleCreatePolicy(policy)}
            />
          </div>
        )}
      </div>
    </ChartCard>
  )
}

function PolicyList({
  policies,
  applyingId,
  deletingId,
  onDelete,
  onToggleStatus,
}: {
  policies: StoredPolicy[]
  applyingId: string | null
  deletingId: string | null
  onDelete: (id: string) => void
  onToggleStatus: (id: string) => void
}) {
  const [openYamlId, setOpenYamlId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = async (policy: StoredPolicy) => {
    try {
      await navigator.clipboard.writeText(policy.yaml)
      setCopiedId(policy.id)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setCopiedId(null)
    }
  }

  if (policies.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">아직 등록된 정책이 없습니다.</p>
        <p className="mt-1 text-xs text-gray-500">PDF를 업로드해 새로운 정책을 추가해보세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {policies.map((policy) => {
        const isActive = policy.status === 'active'
        const statusLabel = isActive ? '활성' : '비활성'
        const statusClassName = isActive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-600'
        const isOpen = openYamlId === policy.id
        const isApplying = applyingId === policy.id
        const isDeleting = deletingId === policy.id

        return (
          <div key={policy.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
                      <ShieldCheck className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{policy.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{policy.source}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{getDisplayDescription(policy)}</p>
                </div>
                <span className={`inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[11px] leading-none ${statusClassName}`}>{statusLabel}</span>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Origin', value: policy.origin },
                  { label: '카테고리', value: policy.category },
                  { label: '심각도', value: policy.severity },
                  { label: '마지막 갱신', value: policy.lastUpdated },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-gray-800">{item.value}</p>
                  </div>
                ))}
              </div>

              {isOpen && (
                <pre className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 shadow-inner">
                  {policy.yaml}
                </pre>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setOpenYamlId((current) => (current === policy.id ? null : policy.id))}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {isOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {isOpen ? 'YAML 닫기' : 'YAML 보기'}
                </button>
                <button
                  onClick={() => void handleCopy(policy)}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {copiedId === policy.id ? <Check className="h-3.5 w-3.5 text-indigo-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === policy.id ? '복사됨' : '복사'}
                </button>
                <button
                  onClick={() => onToggleStatus(policy.id)}
                  disabled={isApplying}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    isActive
                      ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isApplying ? (isActive ? '비활성화 중...' : '활성화 중...') : isActive ? '비활성화' : '활성화'}</span>
                </button>
                <button
                  onClick={() => onDelete(policy.id)}
                  disabled={isDeleting}
                  className="ml-auto flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{isDeleting ? '삭제 중...' : '삭제'}</span>
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function PolicyPage() {
  const [policies, setPolicies] = useState<StoredPolicy[]>([])
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const lastPolicyInsertedAt = getLastPolicyInsertedAt(policies)

  useEffect(() => {
    let cancelled = false

    void apiFetch<RegistryPoliciesResponse>('/api/policies/registry')
      .then((result) => {
        if (!cancelled) {
          setPolicies(Array.isArray(result.policies) ? result.policies : [])
        }
      })
      .catch((error) => {
        console.error('Failed to load policy registry:', error instanceof Error ? error.message : error)
      })

    return () => {
      cancelled = true
    }
  }, [])


  const handleCreatePolicy = async (nextPolicies: StoredPolicy[]) => {
    const result = await apiFetch<RegistryPoliciesResponse>('/api/policies/registry', {
      method: 'POST',
      body: JSON.stringify({ policies: nextPolicies }),
    })

    setPolicies((current) => [...result.policies, ...current.filter((policy) => !result.policies.some((created) => created.id === policy.id))])
  }


  const handleTogglePolicyStatus = async (id: string) => {
    const target = policies.find((policy) => policy.id === id)
    if (!target) return

    setApplyingId(id)

    try {
      if (target.status === 'active') {
        await apiFetch<DeletePolicyResponse>('/api/policies/deactivate', {
          method: 'POST',
          body: JSON.stringify({ id }),
        })

        const lastUpdated = formatTimestamp()
        setPolicies((current) =>
          current.map((policy) =>
            policy.id === id
              ? {
                  ...policy,
                  status: 'paused' as PolicyStatus,
                  lastUpdated,
                }
              : policy,
          ),
        )

        void apiFetch<RegistryPolicyResponse>(`/api/policies/registry/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'paused',
            lastUpdated,
          }),
        })

        return
      }

      await apiFetch<ApplyPolicyResponse>('/api/policies/apply', {
        method: 'POST',
        body: JSON.stringify({
          policies: [
            {
              policyPath: target.policyPath,
              yaml: target.yaml,
              policyName: target.name,
              summary: target.description,
            },
          ],
        }),
      })

      const lastUpdated = formatTimestamp()
      setPolicies((current) =>
        current.map((policy) =>
          policy.id === id
            ? {
                ...policy,
                status: 'active' as PolicyStatus,
                lastUpdated,
              }
            : policy,
        ),
      )

      void apiFetch<RegistryPolicyResponse>(`/api/policies/registry/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'active',
          lastUpdated,
        }),
      })
    } finally {
      setApplyingId(null)
    }
  }

  const handleDeletePolicy = async (id: string) => {
    const target = policies.find((policy) => policy.id === id)
    if (!target) return

    const confirmedMessage = `정책 "${target.name}" 을(를) 삭제할까요?\n\n목록에서 제거되고, GitHub에는 ${target.policyPath} 가 기본 브랜치에서 바로 삭제됩니다.`
    const confirmed = window.confirm(confirmedMessage)
    if (!confirmed) return

    setDeletingId(id)

    try {
      await apiFetch<DeletePolicyResponse>(`/api/policies/registry/${id}`, {
        method: 'DELETE',
      })
      setPolicies((current) => current.filter((policy) => policy.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="보안 정책"
        subtitle="KISA 주요정보통신기반시설 기술적 취약점 분석·평가 방법 상세가이드 PDF를 분석해 Checkov custom policy YAML을 만들고 반영합니다."
        lastUpdated={lastPolicyInsertedAt}
        lastUpdatedLabel="마지막 정책 등록"
        titleAction={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
              등록 {policies.length}
            </span>
            <span className="hidden items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              활성 0
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <PolicyUploadCard onCreate={handleCreatePolicy} />

        <ChartCard
          title="정책 목록"
          showActions={false}
        >
          <PolicyList
            policies={policies}
            applyingId={applyingId}
            deletingId={deletingId}
            onDelete={handleDeletePolicy}
            onToggleStatus={(id) => void handleTogglePolicyStatus(id)}
          />
        </ChartCard>
      </div>
    </div>
  )
}

