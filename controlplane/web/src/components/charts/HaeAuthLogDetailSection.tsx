/**
 * 침해 — 인프라적 로그 탭 · 인증·권한(CloudTrail) 세부 지표
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
import {
  filterAuthTrailEvents,
  countByKey,
  trailAuthRiskTier,
} from '@/lib/cloudTrailAuth'

const TOP_EVENT_NAMES = 8
const TOP_SOURCES = 6
const MAX_ROWS = 30

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

const RISK_STYLE: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-rose-100 text-rose-900 border-rose-200',
  medium: 'bg-amber-100 text-amber-900 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
}

type Props = {
  events: TrailEvent[] | undefined
  loading: boolean
}

export default function HaeAuthLogDetailSection({ events, loading }: Props) {
  const trail = events ?? []
  const derived = useMemo(() => {
    const auth = filterAuthTrailEvents(trail)
    const sorted = [...auth].sort((a, b) => (b.event_time || '').localeCompare(a.event_time || ''))
    const byName = countByKey(auth.map((e) => e.event_name || '—')).slice(0, TOP_EVENT_NAMES)
    const bySource = countByKey(auth.map((e) => e.event_source || '—')).slice(0, TOP_SOURCES)
    const usernames = auth.map((e) => e.username).filter((u) => u && u.trim())
    const ips = auth.map((e) => e.source_ip).filter((ip) => ip && ip.trim())
    const uniqueUsers = new Set(usernames).size
    const uniqueIps = new Set(ips).size
    const ratioPct =
      trail.length > 0 ? Math.round((auth.length / trail.length) * 1000) / 10 : 0
    const riskCounts = { high: 0, medium: 0, low: 0 }
    for (const e of auth) {
      riskCounts[trailAuthRiskTier(e.event_name)]++
    }
    return {
      auth,
      sorted,
      byName: byName.map((x) => ({ label: x.key, count: x.count })),
      bySource: bySource.map((x) => ({ label: x.key, count: x.count })),
      uniqueUsers,
      uniqueIps,
      ratioPct,
      riskCounts,
    }
  }, [trail])

  const showSkeleton = loading && trail.length === 0

  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
          <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
        </div>
        <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  const { auth, sorted, byName, bySource, uniqueUsers, uniqueIps, ratioPct, riskCounts } = derived

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">인증·권한 이벤트</p>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">{auth.length}건</p>
          <p className="text-[10px] text-gray-400 mt-0.5">필터 매칭</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">샘플 대비 비율</p>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">{ratioPct}%</p>
          <p className="text-[10px] text-gray-400 mt-0.5">전체 {trail.length}건 중</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">고유 사용자명</p>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">{uniqueUsers}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">UserName 필드</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">고유 소스 IP</p>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">{uniqueIps}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">식별된 경우</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">위험(추정) 높음</p>
          <p className="text-lg font-semibold text-rose-800 tabular-nums">{riskCounts.high}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">이벤트명 키워드</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">중간 / 낮음</p>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">
            {riskCounts.medium} / {riskCounts.low}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">동일 기준</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="EventName 상위"
          subtitle={`인증·권한 필터 적용 · 최대 ${TOP_EVENT_NAMES}개`}
          showActions={false}
        >
          <div className="flex justify-end mb-2">
            <SourceBadge source="cloudtrail" />
          </div>
          {byName.length === 0 ? (
            <p className="text-xs text-gray-400 py-10 text-center">해당 이벤트가 없습니다.</p>
          ) : (
            <div className="flex items-center justify-center w-full" style={{ height: `${byName.length * 36 + 40}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byName}
                  layout="vertical"
                  barSize={18}
                  margin={{ top: 4, right: 32, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={140}
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v: string) =>
                      v.length > 20 ? `${v.slice(0, 18)}…` : v
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v}건`, '건수']}
                    labelFormatter={(l) => String(l)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="count" name="건수" radius={[0, 4, 4, 0]}>
                    {byName.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? '#4f46e5' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="EventSource 분포"
          subtitle="IAM·STS·SignIn 등 서비스별 건수"
          showActions={false}
        >
          <div className="flex justify-end mb-2">
            <SourceBadge source="cloudtrail" />
          </div>
          {bySource.length === 0 ? (
            <p className="text-xs text-gray-400 py-10 text-center">데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-50/95">
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="px-2 py-1.5 font-medium">eventSource</th>
                    <th className="px-2 py-1.5 font-medium text-right tabular-nums">건수</th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.map((row) => (
                    <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-2 py-1.5 text-gray-800 font-mono text-[10px] break-all">
                        {row.label}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-900">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="인증·권한 이벤트 목록"
        subtitle={`최신 순 · 최대 ${MAX_ROWS}건 · LookupEvents 샘플과 동일 범위`}
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudtrail" />
        </div>
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-400 py-8 text-center">
            필터에 맞는 이벤트가 없거나 CloudTrail 샘플이 비어 있습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-[min(420px,55vh)] overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-gray-50/95 z-[1]">
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">시간</th>
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">위험</th>
                  <th className="px-2 py-1.5 font-medium">EventName</th>
                  <th className="px-2 py-1.5 font-medium">EventSource</th>
                  <th className="px-2 py-1.5 font-medium">UserName</th>
                  <th className="px-2 py-1.5 font-medium">소스 IP</th>
                  <th className="px-2 py-1.5 font-medium min-w-[120px]">리소스</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, MAX_ROWS).map((e, idx) => {
                  const risk = trailAuthRiskTier(e.event_name)
                  return (
                    <tr key={`${e.event_time}-${e.event_name}-${idx}`} className="border-b border-gray-50 hover:bg-gray-50/50">
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
                      <td className="px-2 py-1.5 text-gray-900 font-mono text-[10px] max-w-[140px] truncate" title={e.event_name}>
                        {e.event_name || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 font-mono text-[10px] max-w-[160px] truncate" title={e.event_source}>
                        {e.event_source || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-800 max-w-[100px] truncate" title={e.username}>
                        {e.username || '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 font-mono text-[10px]">{e.source_ip || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600 max-w-[200px] truncate" title={resourceSummary(e)}>
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
