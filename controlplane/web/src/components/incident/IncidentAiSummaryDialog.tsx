import { AlertCircle, Loader2, Sparkles, X } from 'lucide-react'
import type { IncidentAiAnalysisResponse } from '@/lib/incidentAi'

interface IncidentAiSummaryDialogProps {
  open: boolean
  loading: boolean
  error: string | null
  analysis: IncidentAiAnalysisResponse | null
  onClose: () => void
}

function renderSection(title: string, items: string[], tone: 'slate' | 'amber' | 'emerald' = 'slate') {
  if (items.length === 0) {
    return null
  }

  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-slate-200 bg-slate-50 text-slate-900'

  return (
    <section className={`rounded-2xl border p-4 ${toneClass}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6">
        {items.map((item) => (
          <li key={`${title}-${item}`} className="rounded-xl bg-white/70 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function IncidentAiSummaryDialog({
  open,
  loading,
  error,
  analysis,
  onClose,
}: IncidentAiSummaryDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 sm:p-8">
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" />
                AI 요약
              </span>
              {analysis?.provider && (
                <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500">
                  {analysis.provider === 'gemini' ? 'Gemini' : 'Fallback'}
                </span>
              )}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              {analysis?.title || '전체 로그 AI 분석'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              현재 페이지에서 수집한 전체 로그와 요약 카드를 기준으로 생성한 운영 요약입니다.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            onClick={onClose}
            aria-label="AI 분석 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 py-5 sm:px-6">
          {loading && (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="mt-4 text-sm font-medium text-slate-900">전체 로그를 분석하고 있습니다.</p>
              <p className="mt-1 text-sm text-slate-500">CloudTrail, CloudWatch, Prometheus 요약을 함께 읽는 중입니다.</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">AI 분석을 불러오지 못했습니다.</p>
                  <p className="mt-1 leading-6">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && analysis && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">전체 요약</h3>
                <p className="mt-3 text-sm leading-7 text-slate-700">{analysis.overview}</p>
              </section>

              {renderSection('핵심 포인트', analysis.keyFindings)}
              {renderSection('주의할 리스크', analysis.risks, 'amber')}
              {renderSection('권장 대응', analysis.recommendedActions, 'emerald')}
              {renderSection('근거 로그', analysis.evidence)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
