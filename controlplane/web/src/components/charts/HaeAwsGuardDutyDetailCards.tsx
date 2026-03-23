/**
 * 침해 — GuardDuty 세부: 탐지 목록
 */
import { useMemo } from 'react'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { GdFinding } from '@/hooks/useDashboardData'

const MAX_ROWS = 20

type Props = {
  findings: GdFinding[] | undefined
  loading: boolean
}

function formatGdTime(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso.slice(0, 16).replace('T', ' ')
  }
}

export default function HaeAwsGuardDutyDetailCards({ findings, loading }: Props) {
  const list = findings ?? []

  const sorted = useMemo(
    () =>
      [...list].sort(
        (a, b) => b.severity - a.severity || (b.updated_at || '').localeCompare(a.updated_at || ''),
      ),
    [list],
  )

  const showSkeleton = loading && list.length === 0

  if (showSkeleton) {
    return <div className="h-52 rounded-xl bg-gray-100 animate-pulse" />
  }

  if (list.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-6 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
        GuardDuty 탐지가 없거나 API 샘플이 비어 있습니다.
      </p>
    )
  }

  return (
    <ChartCard title="탐지 목록" subtitle={`심각도·시간 순 · 최대 ${MAX_ROWS}건`} showActions={false}>
      <div className="flex justify-end mb-2">
        <SourceBadge source="cloudwatch" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-[min(360px,48vh)] overflow-y-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-gray-50/95 z-[1]">
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="px-2 py-1.5 font-medium">심각도</th>
              <th className="px-2 py-1.5 font-medium">제목·유형</th>
              <th className="px-2 py-1.5 font-medium">리전</th>
              <th className="px-2 py-1.5 font-medium whitespace-nowrap">갱신</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, MAX_ROWS).map((f) => (
              <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/50 align-top">
                <td className="px-2 py-1.5 tabular-nums">
                  <span className="font-semibold text-gray-900">{f.severity}</span>
                  <span className="text-gray-500 text-[10px] ml-1">({f.severity_label})</span>
                </td>
                <td className="px-2 py-1.5 text-gray-800 max-w-[200px]">
                  <div className="font-medium line-clamp-2" title={f.title}>
                    {f.title || '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono truncate" title={f.type}>
                    {f.type || ''}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{f.region || '—'}</td>
                <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap tabular-nums">
                  {formatGdTime(f.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
