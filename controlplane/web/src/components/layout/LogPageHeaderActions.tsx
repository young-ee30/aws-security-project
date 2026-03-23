import { FileDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type PageKind = 'monitoring' | 'incident' | 'gwanje' | 'hae'

interface LogPageHeaderActionsProps {
  /** 추후 보고서/AI API 구분용 */
  page: PageKind
  className?: string
}

function reportContextLabel(page: PageKind): string {
  if (page === 'monitoring' || page === 'gwanje') return '관제'
  if (page === 'hae') return '침해'
  return '침해사고'
}

/**
 * 관제측면 로그 / 침해사고 측면 로그 / 관제·침해 요약 페이지 공통 — 보고서 출력 · AI 분석
 * (동작은 추후 연동; 현재는 플레이스홀더)
 */
export default function LogPageHeaderActions({ page, className }: LogPageHeaderActionsProps) {
  const label = reportContextLabel(page)

  return (
    <div className={cn('flex items-center gap-2 flex-wrap justify-end', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium',
          'text-gray-800 shadow-sm transition-colors hover:bg-gray-50',
        )}
        onClick={() => {
          window.alert(`「${label}」보고서 출력은 준비 중입니다.`)
        }}
      >
        <FileDown className="w-4 h-4 shrink-0 text-gray-600" aria-hidden />
        보고서 출력
      </button>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-600 px-3 py-2 text-sm font-medium',
          'text-white shadow-sm transition-colors hover:bg-indigo-700',
        )}
        onClick={() => {
          window.alert(`「${label}」AI 분석은 준비 중입니다.`)
        }}
      >
        <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
        AI 분석
      </button>
    </div>
  )
}
