import { FileDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type PageKind = 'monitoring' | 'incident' | 'gwanje' | 'hae'

interface LogPageHeaderActionsProps {
  page: PageKind
  className?: string
  onReport?: () => void
  reportLoading?: boolean
  onAnalyze?: () => void
  analysisLoading?: boolean
}

function reportContextLabel(page: PageKind): string {
  if (page === 'monitoring' || page === 'gwanje') return '관제'
  if (page === 'hae') return '침해'
  return '관제·침해'
}

export default function LogPageHeaderActions({
  page,
  className,
  onReport,
  reportLoading = false,
  onAnalyze,
  analysisLoading = false,
}: LogPageHeaderActionsProps) {
  const label = reportContextLabel(page)

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium',
          'text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-80',
        )}
        onClick={() => {
          if (onReport) {
            onReport()
            return
          }

          window.alert(`「${label}」보고서 출력은 준비 중입니다.`)
        }}
        disabled={reportLoading}
      >
        <FileDown className="h-4 w-4 shrink-0 text-gray-600" aria-hidden />
        {reportLoading ? '보고서 생성중...' : '보고서 출력'}
      </button>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-2 text-sm font-medium',
          'text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-80',
        )}
        onClick={() => {
          if (onAnalyze) {
            onAnalyze()
            return
          }

          window.alert(`「${label}」AI 분석은 준비 중입니다.`)
        }}
        disabled={analysisLoading}
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        {analysisLoading ? 'AI 분석중...' : 'AI 분석'}
      </button>
    </div>
  )
}
