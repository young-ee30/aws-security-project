import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/Header'
import ChartCard from '@/components/common/ChartCard'
import { type PolicyStatus, type PolicyTemplate } from '@/data/mockData'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:4000'

type ProviderLabel = 'gemini' | 'fallback'
type PolicySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface ApplyPullRequest {
  number: number
  htmlUrl: string
  title: string
}

interface GeneratedPolicyItem {
  sourcePolicyId?: string
  sourcePolicyTitle?: string
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

interface ApplyPolicyPayload {
  policyPath: string
  yaml: string
  policyName?: string
  summary?: string
}

interface StoredPolicy extends PolicyTemplate {
  policyPath: string
  provider: ProviderLabel
  policyId: string
  category: string
  severity: PolicySeverity
  targetProvider: string
  appliedPullRequest?: ApplyPullRequest | null
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
  attemptedProvider?: 'gemini'
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
  pullRequest: ApplyPullRequest
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

function formatPageUpdatedAt() {
  return new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getProviderLabel(provider: ProviderLabel) {
  if (provider === 'gemini') return 'Gemini'
  return 'Fallback'
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
  appliedPullRequest?: ApplyPullRequest | null,
): StoredPolicy {
  return {
    id: `policy-${Date.now()}-${policy.policyId}`,
    name: policy.policyName,
    description: policy.description,
    source: sourceFileName,
    checks: 1,
    status: 'draft',
    lastUpdated: formatTimestamp(),
    yaml: policy.yaml,
    policyPath: policy.policyPath,
    provider,
    policyId: policy.policyId,
    category: policy.category,
    severity: policy.severity,
    targetProvider: policy.targetProvider,
    appliedPullRequest: appliedPullRequest || null,
    sourcePolicyId: policy.sourcePolicyId,
    sourcePolicyTitle: policy.sourcePolicyTitle,
  }
}

function BatchPreviewList({
  policies,
  openId,
  copiedId,
  onToggleOpen,
  onCopyYaml,
}: {
  policies: GeneratedPolicyItem[]
  openId: string | null
  copiedId: string | null
  onToggleOpen: (policyId: string) => void
  onCopyYaml: (policy: GeneratedPolicyItem) => void
}) {
  return (
    <div className="space-y-4">
      {policies.map((policy) => {
        const isOpen = openId === policy.policyId

        return (
          <div key={policy.policyId} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{policy.policyName}</p>
                  {(policy.sourcePolicyId || policy.sourcePolicyTitle) && (
                    <p className="mt-1 text-xs text-gray-500">
                      {[policy.sourcePolicyId, policy.sourcePolicyTitle].filter(Boolean).join(' / ')}
                    </p>
                  )}
                  <p className="mt-2 text-sm leading-6 text-gray-600">{policy.description}</p>
                  <p className="mt-2 text-xs text-gray-500">{policy.summary}</p>
                </div>
                <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600">
                  {policy.policyPath}
                </span>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">
                  {policy.policyId}
                </span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                  {policy.category}
                </span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                  {policy.severity}
                </span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                  provider: {policy.targetProvider}
                </span>
              </div>

              {isOpen && (
                <pre className="max-h-72 overflow-auto rounded-xl border border-gray-700 bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-100">
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
  onApplyDraft,
  onBatchApplied,
}: {
  onCreate: (policies: StoredPolicy[]) => Promise<void>
  onApplyDraft: (policies: ApplyPolicyPayload[]) => Promise<ApplyPolicyResponse>
  onBatchApplied: (policyPaths: string[], pullRequest: ApplyPullRequest) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<GeneratedPolicyResponse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [created, setCreated] = useState(false)
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedPolicyId, setCopiedPolicyId] = useState<string | null>(null)
  const [openPreviewId, setOpenPreviewId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyPolicyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const copied = copiedAll

  const analyzeFile = async (file: File) => {
    setGenerating(true)
    setCreated(false)
    setCopiedAll(false)
    setCopiedPolicyId(null)
    setOpenPreviewId(null)
    setPreview(null)
    setApplyResult(null)
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
    setCreated(false)
    setCopiedAll(false)
    setCopiedPolicyId(null)
    setOpenPreviewId(null)
    setApplying(false)
    setApplyResult(null)
    setError(null)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleCreate = async () => {
    if (!selectedFile || !preview) return

    try {
      await onCreate(
        preview.policies.map((policy) =>
          buildStoredPolicy(selectedFile.name, policy, preview.mode === 'llm' ? preview.provider : 'fallback', applyResult?.pullRequest),
        ),
      )

      setCreated(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : '정책 저장에 실패했습니다.'
      setError(message)
      setCreated(false)
    }
  }

  const handleCopyAllYaml = async () => {
    if (!preview) return

    const combinedYaml = preview.policies.map((policy) => `# ${policy.policyPath}\n${policy.yaml.trim()}`).join('\n\n')

    try {
      await navigator.clipboard.writeText(combinedYaml)
      setCopiedAll(true)
      window.setTimeout(() => setCopiedAll(false), 1500)
    } catch {
      setCopiedAll(false)
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

  const handleApply = async () => {
    if (!preview) return

    setApplying(true)
    setError(null)

    try {
      const result = await onApplyDraft(
        preview.policies.map((policy) => ({
          policyPath: policy.policyPath,
          yaml: policy.yaml,
          policyName: policy.policyName,
          summary: policy.summary,
        })),
      )
      setApplyResult(result)
      onBatchApplied(result.policyPaths, result.pullRequest)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'GitHub 적용에 실패했습니다.'
      setError(message)
    } finally {
      setApplying(false)
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
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}
          >
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border ${dragOver ? 'border-indigo-200 bg-indigo-100' : 'border-gray-200 bg-gray-100'
                }`}
            >
              <Upload className={`h-7 w-7 ${dragOver ? 'text-indigo-600' : 'text-gray-400'}`} />
            </div>
            <p className="text-base font-medium text-gray-800">PDF를 드래그하거나 클릭해서 업로드</p>
            <p className="mt-1 text-sm text-gray-500">PDF 내용을 상세 분석하여 새로운 점검 정책을 만듭니다.</p>
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
              <span>새로운 점검 정책 생성 중</span>
            </div>
            <p className="mt-1 text-xs text-indigo-600/80">정책 적용을 위한 새로운 yaml 파일 생성중입니다.</p>
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
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-medium text-indigo-700">Checkov custom policy 생성 완료</p>
                </div>
                <p className="mt-1 text-sm text-gray-600">{preview.summary}</p>
              </div>
              <span className="rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                생성 {preview.policyCount}건
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Generated</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{preview.policyCount}</p>
                <p className="mt-1 text-xs text-gray-500">생성된 Checkov 정책</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Skipped</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{preview.skippedPolicies?.length || 0}</p>
                <p className="mt-1 text-xs text-gray-500">YAML로 만들지 않은 원문 정책</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Provider</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{getProviderLabel(preview.provider)}</p>
                <p className="mt-1 text-xs text-gray-500">정책 생성 모델</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Source File</p>
                <p className="mt-1 break-all text-sm font-medium text-gray-900">{preview.fileName}</p>
                <p className="mt-1 text-xs text-gray-500">업로드한 문서</p>
              </div>
            </div>

            <div className="hidden grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">생성 모드</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{preview.mode === 'llm' ? 'LLM 분석' : 'Fallback'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">공급자</p>
                <p className="mt-1 text-sm font-medium text-gray-800">
                  {preview.mode === 'llm'
                    ? getProviderLabel(preview.provider)
                    : `${preview.attemptedProvider ? `${getProviderLabel(preview.attemptedProvider)} 시도` : 'Fallback'}`}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">카테고리</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{preview.policyCount}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">심각도</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{preview.fileName}</p>
              </div>
            </div>

            {preview.llmError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800">Gemini 호출 실패로 fallback 생성됨</p>
                <p className="mt-1 text-xs text-amber-700">{preview.llmError}</p>
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

            {applyResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-emerald-700">GitHub 반영 완료</p>
                    <p className="mt-1 text-xs text-emerald-700/80">
                      브랜치 `{applyResult.branchName}` 에 custom policy 파일을 push하고 PR #{applyResult.pullRequest.number} 를 만들었습니다.
                    </p>
                  </div>
                  <a
                    href={applyResult.pullRequest.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    PR 보기
                  </a>
                </div>
              </div>
            )}


            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopyAllYaml}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                {copiedAll ? <Check className="h-4 w-4 text-indigo-600" /> : <Copy className="h-4 w-4" />}
                {copied ? '복사됨' : 'YAML 복사'}
              </button>
              <button
                onClick={() => void handleApply()}
                disabled={applying}
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />
                {applying ? 'GitHub 적용 중...' : 'GitHub 적용(PR 생성)'}
              </button>
              {!created ? (
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  <FilePlus className="h-4 w-4" />
                  정책 목록에 추가
                </button>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
                  <CheckCircle2 className="h-4 w-4" />
                  정책 목록에 추가됨
                </div>
              )}
            </div>

            <BatchPreviewList
              policies={preview.policies}
              openId={openPreviewId}
              copiedId={copiedPolicyId}
              onToggleOpen={(policyId) => setOpenPreviewId((current) => (current === policyId ? null : policyId))}
              onCopyYaml={(policy) => void handleCopyYaml(policy)}
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
  onToggleStatus,
  onDelete,
  onApply,
}: {
  policies: StoredPolicy[]
  applyingId: string | null
  onToggleStatus: (id: string) => void
  onDelete: (id: string) => void
  onApply: (id: string) => void
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
        <p className="mt-1 text-xs text-gray-500">PDF를 업로드해 새로운 점검 정책을 만들어 보세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {policies.map((policy) => {
        const status = policyStatusStyles[policy.status]
        const isOpen = openYamlId === policy.id
        const isApplying = applyingId === policy.id

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
                  <p className="mt-3 text-sm text-gray-600">{policy.description}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    경로: {policy.policyPath} · 공급자: {getProviderLabel(policy.provider)} · ID: {policy.policyId}
                  </p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${status.className}`}>{status.label}</span>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {[
                  { label: '카테고리', value: policy.category },
                  { label: '심각도', value: policy.severity },
                  { label: '대상', value: policy.targetProvider },
                  { label: '마지막 갱신', value: policy.lastUpdated },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-center">
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="mt-1 text-sm font-medium text-gray-800">{item.value}</p>
                  </div>
                ))}
              </div>

              {policy.appliedPullRequest && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-emerald-700">GitHub 반영됨</p>
                      <p className="mt-1 text-xs text-emerald-700/80">PR #{policy.appliedPullRequest.number} 에 custom policy 파일이 등록되어 있습니다.</p>
                    </div>
                    <a
                      href={policy.appliedPullRequest.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      PR 보기
                    </a>
                  </div>
                </div>
              )}

              {isOpen && (
                <pre className="max-h-56 overflow-auto rounded-xl border border-gray-700 bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-100">
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
                  onClick={() => onApply(policy.id)}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isApplying ? '적용 중...' : 'GitHub 적용'}
                </button>
                <button
                  onClick={() => onToggleStatus(policy.id)}
                  className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {policy.status === 'active' ? '정책 중지' : '정책 활성화'}
                </button>
                <button
                  onClick={() => onDelete(policy.id)}
                  className="ml-auto flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
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
  const activePolicyCount = policies.filter((policy) => policy.status === 'active').length

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

  const applyDraft = async (draftPolicies: ApplyPolicyPayload[]) => {
    return apiFetch<ApplyPolicyResponse>('/api/policies/apply', {
      method: 'POST',
      body: JSON.stringify({
        policies: draftPolicies,
      }),
    })
  }

  const handleCreatePolicy = async (nextPolicies: StoredPolicy[]) => {
    const result = await apiFetch<RegistryPoliciesResponse>('/api/policies/registry', {
      method: 'POST',
      body: JSON.stringify({ policies: nextPolicies }),
    })

    setPolicies((current) => [...result.policies, ...current.filter((policy) => !result.policies.some((created) => created.id === policy.id))])
  }

  const handleBatchApplied = (policyPaths: string[], pullRequest: ApplyPullRequest) => {
    setPolicies((current) => {
      const next = current.map((policy) =>
        policyPaths.includes(policy.policyPath)
          ? {
              ...policy,
              appliedPullRequest: pullRequest,
              lastUpdated: formatTimestamp(),
            }
          : policy,
      )

      for (const policy of next.filter((item) => policyPaths.includes(item.policyPath))) {
        void apiFetch<RegistryPolicyResponse>(`/api/policies/registry/${policy.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            appliedPullRequest: policy.appliedPullRequest,
            lastUpdated: policy.lastUpdated,
          }),
        })
      }

      return next
    })
  }

  const handleTogglePolicyStatus = (id: string) => {
    setPolicies((current) => {
      const next = current.map((policy) =>
        policy.id === id
          ? {
              ...policy,
              status: (policy.status === 'active' ? 'paused' : 'active') as PolicyStatus,
              lastUpdated: formatTimestamp(),
            }
          : policy,
      )

      const target = next.find((policy) => policy.id === id)
      if (target) {
        void apiFetch<RegistryPolicyResponse>(`/api/policies/registry/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: target.status,
            lastUpdated: target.lastUpdated,
          }),
        })
      }

      return next
    })
  }

  const handleDeletePolicy = (id: string) => {
    setPolicies((current) => current.filter((policy) => policy.id !== id))
    void apiFetch<{ ok: boolean }>(`/api/policies/registry/${id}`, {
      method: 'DELETE',
    })
  }

  const handleApplyPolicy = async (id: string) => {
    const target = policies.find((policy) => policy.id === id)
    if (!target) return

    setApplyingId(id)

    try {
      const result = await apiFetch<ApplyPolicyResponse>('/api/policies/apply', {
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
                appliedPullRequest: result.pullRequest,
                lastUpdated,
              }
            : policy,
        ),
      )
      void apiFetch<RegistryPolicyResponse>(`/api/policies/registry/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          appliedPullRequest: result.pullRequest,
          lastUpdated,
        }),
      })
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="보안 정책"
        subtitle="KISA 주요정보통신기반시설 기술적 취약점 분석·평가 방법 상세가이드 PDF를 분석해 Checkov custom policy YAML을 만들고 이를 반영합니다."
        lastUpdated={formatPageUpdatedAt()}
        titleAction={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
              등록 {policies.length}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              활성 {activePolicyCount}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <PolicyUploadCard onCreate={handleCreatePolicy} onApplyDraft={applyDraft} onBatchApplied={handleBatchApplied} />

        <ChartCard
          title="정책 목록"
          showActions={false}
        >
          <PolicyList
            policies={policies}
            applyingId={applyingId}
            onToggleStatus={handleTogglePolicyStatus}
            onDelete={handleDeletePolicy}
            onApply={(id) => void handleApplyPolicy(id)}
          />
        </ChartCard>
      </div>
    </div>
  )
}
