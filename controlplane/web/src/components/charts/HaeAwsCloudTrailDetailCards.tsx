/**
 * 침해 — AWS 리소스 로그 탭 · CloudTrail 세부 (최대 2카드: 집계 + 전체 목록)
 */
import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { TrailEvent } from '@/hooks/useDashboardData'
import { countByKey, trailMgmtEventRiskHint } from '@/lib/cloudTrailAuth'

const TOP_NAMES = 8
const MAX_ROWS = 25

const RISK_STYLE: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-rose-100 text-rose-900 border-rose-200',
  medium: 'bg-amber-100 text-amber-900 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

function formatTrailTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' }
  try {
    const d = new Date(iso)
    return {
      date: d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
      time: d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    }
  } catch {
    const parts = iso.slice(0, 19).replace('T', ' ').split(' ')
    return { date: parts[0] ?? '—', time: parts[1] ?? '' }
  }
}

function resourceSummary(e: TrailEvent): string {
  const parts = (e.resources || []).map((r) => r.name || r.type).filter(Boolean)
  return parts.length ? parts.join(', ') : '—'
}

type Props = {
  events: TrailEvent[] | undefined
  loading: boolean
}

export default function HaeAwsCloudTrailDetailCards({ events, loading }: Props) {
  const trail = events ?? []

  const { byName, sorted } = useMemo(() => {
    const byNameInner = countByKey(trail.map((e) => e.event_name || '—'))
      .slice(0, TOP_NAMES)
      .map((x) => ({ label: x.key, count: x.count }))
    const sortedInner = [...trail].sort((a, b) => (b.event_time || '').localeCompare(a.event_time || ''))
    return { byName: byNameInner, sorted: sortedInner }
  }, [trail])

  const showSkeleton = loading && trail.length === 0

  if (showSkeleton) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="h-56 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <ChartCard
        title="EventName 분포"
        subtitle={`샘플 전체 기준 상위 ${TOP_NAMES}개 · 필터 없음`}
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudtrail" />
        </div>
        {byName.length === 0 ? (
          <p className="text-xs text-gray-400 py-10 text-center">CloudTrail 이벤트가 없습니다.</p>
        ) : (
          <div className="flex items-center justify-center w-full -ml-4" style={{ height: `${byName.length * 36 + 40}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byName}
                layout="vertical"
                barSize={18}
                margin={{ top: 4, right: 25, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={124}
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 16)}…` : v)}
                />
                <Tooltip
                  formatter={(v: number) => [`${v}건`, '건수']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" name="건수" radius={[0, 4, 4, 0]}>
                  {byName.map((_, i) => (
                    <Cell key={i} fill={i < 3 ? '#7c3aed' : '#a78bfa'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="최근 이벤트 목록"
        subtitle={`시간 역순 · 최대 ${MAX_ROWS}건 · LookupEvents 샘플과 동일`}
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudtrail" />
        </div>
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-400 py-8 text-center">이벤트가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-[min(380px,50vh)] overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-gray-50/95 z-[1]">
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">시간</th>
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">위험</th>
                  <th className="px-2 py-1.5 font-medium">EventName</th>
                  <th className="px-2 py-1.5 font-medium">EventSource</th>
                  <th className="px-2 py-1.5 font-medium">UserName</th>
                  <th className="px-2 py-1.5 font-medium">소스 IP</th>
                  <th className="px-2 py-1.5 font-medium min-w-[100px]">리소스</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, MAX_ROWS).map((e, idx) => {
                  const risk = trailMgmtEventRiskHint(e.event_name)
                  return (
                    <tr
                      key={`${e.event_time}-${e.event_name}-${idx}`}
                      className="border-b border-gray-50 hover:bg-gray-50/50 align-top"
                    >
                      <td className="px-2 py-1.5 tabular-nums">
                        {(() => { const t = formatTrailTime(e.event_time); return <><span className="block text-gray-500 text-[10px]">{t.date}</span><span className="block text-gray-700 text-[10px] whitespace-nowrap">{t.time}</span></> })()}
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium border ${RISK_STYLE[risk]}`}
                        >
                          {risk === 'high' ? '높음' : risk === 'medium' ? '중간' : '낮음'}
                        </span>
                      </td>
                      <td
                        className="px-2 py-1.5 text-gray-900 font-mono text-[10px] max-w-[120px] truncate"
                        title={e.event_name}
                      >
                        {e.event_name || '—'}
                      </td>
                      <td
                        className="px-2 py-1.5 text-gray-700 font-mono text-[10px] max-w-[140px] truncate"
                        title={e.event_source}
                      >
                        {e.event_source || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-800 max-w-[90px] truncate" title={e.username}>
                        {e.username || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 font-mono text-[10px]">{e.source_ip || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600 max-w-[160px] truncate" title={resourceSummary(e)}>
                        {resourceSummary(e)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
