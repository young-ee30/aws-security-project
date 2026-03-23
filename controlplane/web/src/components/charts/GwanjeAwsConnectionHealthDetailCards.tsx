/**
 * AWS 리소스 탭 — 동시 연결·신규·거절 연결 시계열 + 정상/비정상 타깃 수 + TG별 헬스 표
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { AlbMetrics, TsPoint } from '@/hooks/useDashboardData'

function tsToTimeLabel(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return timestamp.slice(11, 16)
  }
}

function mergeByTimestamp(series: Array<{ key: string; points?: TsPoint[] }>): Record<string, string | number | undefined>[] {
  const map = new Map<string, Record<string, number | undefined>>()
  for (const { key, points } of series) {
    for (const p of points ?? []) {
      const row = map.get(p.timestamp) ?? {}
      row[key] = p.value
      map.set(p.timestamp, row)
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, vals]) => ({
      time: tsToTimeLabel(timestamp),
      ...vals,
    }))
}

type Props = {
  alb: AlbMetrics | null
  loading: boolean
}

export default function GwanjeAwsConnectionHealthDetailCards({ alb, loading }: Props) {
  const ts = alb?.timeseries
  const connMerged = mergeByTimestamp([
    { key: 'active', points: ts?.active_connections },
    { key: 'newConn', points: ts?.new_connections },
    { key: 'rejected', points: ts?.rejected_connections },
  ])
  const hostMerged = mergeByTimestamp([
    { key: 'healthy', points: ts?.healthy_hosts },
    { key: 'unhealthy', points: ts?.unhealthy_hosts },
  ])

  const hasConn = connMerged.some((d) => d.active != null || d.newConn != null || d.rejected != null)
  const hasHosts = hostMerged.some((d) => d.healthy != null || d.unhealthy != null)
  const targets = alb?.target_health ?? []
  const showSkeleton = loading && !hasConn && !hasHosts && targets.length === 0

  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
        </div>
        <div className="h-36 rounded-lg bg-gray-50 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard
          title="동시·신규·거절 연결"
          subtitle={
            alb?.alb_name
              ? `${alb.alb_name} · 동시=평균, 신규·거절=버킷 합`
              : 'ActiveConnectionCount · NewConnectionCount · RejectedConnectionCount'
          }
          showActions={false}
        >
          <div className="flex justify-end mb-2">
            <SourceBadge source="cloudwatch" />
          </div>
          {alb?.error ? (
            <p className="text-xs text-amber-800 py-6 text-center">{alb.error}</p>
          ) : !hasConn ? (
            <p className="text-xs text-gray-400 py-8 text-center">연결 시계열이 없습니다.</p>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={connMerged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9ca3af" interval="preserveStartEnd" />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10 }}
                    width={40}
                    label={{ value: '동시', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#2563eb' }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    width={44}
                    label={{ value: '신규·거절/버킷', angle: 90, position: 'insideRight', fontSize: 10, fill: '#64748b' }}
                  />
                  <Tooltip
                    formatter={(v: number | string, name: string) => {
                      const n = typeof v === 'number' ? v : Number(v)
                      const u = name.includes('동시') ? '건(평균)' : '건/버킷'
                      return Number.isFinite(n) ? [`${Math.round(n * 100) / 100}${u}`, name] : ['—', name]
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="active"
                    name="동시 연결"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="newConn"
                    name="신규 연결"
                    stroke="#0d9488"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rejected"
                    name="거절 연결"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="정상·비정상 타깃 수"
          subtitle="HealthyHostCount · UnHealthyHostCount (평균)"
          showActions={false}
        >
          <div className="flex justify-end mb-2">
            <SourceBadge source="cloudwatch" />
          </div>
          {!hasHosts ? (
            <p className="text-xs text-gray-400 py-8 text-center">타깃 헬스 시계열이 없습니다.</p>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hostMerged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9ca3af" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} width={32} allowDecimals />
                  <Tooltip
                    formatter={(v: number | string) => {
                      const n = typeof v === 'number' ? v : Number(v)
                      return Number.isFinite(n) ? `${Math.round(n * 10) / 10}대` : '—'
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="healthy"
                    name="정상"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="unhealthy"
                    name="비정상"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="타깃 그룹별 등록 대비 정상" subtitle="ELB DescribeTargetHealth 요약" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        {targets.length === 0 ? (
          <p className="text-xs text-gray-400 py-6 text-center">타깃 그룹 정보가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-gray-50/95">
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-2 py-1.5 font-medium">타깃 그룹</th>
                  <th className="px-2 py-1.5 font-medium text-right tabular-nums">포트</th>
                  <th className="px-2 py-1.5 font-medium text-right tabular-nums">정상</th>
                  <th className="px-2 py-1.5 font-medium text-right tabular-nums">전체</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((tg) => (
                  <tr key={`${tg.name}-${tg.port}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-2 py-1.5 text-gray-800 max-w-[220px] truncate" title={tg.name}>
                      {tg.name}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{tg.port || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-emerald-800">{tg.healthy}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">{tg.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
