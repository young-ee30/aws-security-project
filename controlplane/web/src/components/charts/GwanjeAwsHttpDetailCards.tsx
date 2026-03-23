/**
 * AWS 리소스 탭 — HTTP 세부: ALB HTTPCode_Target 2xx/4xx/5xx 시계열 + Prometheus 라우트별 4xx/5xx
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
import type { MetricsState } from '@/hooks/useMetrics'

const MAX_ROUTES = 15

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

function mergeHttpCodes(x2?: TsPoint[], x4?: TsPoint[], x5?: TsPoint[]) {
  const map = new Map<string, { v2?: number; v4?: number; v5?: number }>()
  for (const p of x2 ?? []) {
    const cur = map.get(p.timestamp) ?? {}
    cur.v2 = p.value
    map.set(p.timestamp, cur)
  }
  for (const p of x4 ?? []) {
    const cur = map.get(p.timestamp) ?? {}
    cur.v4 = p.value
    map.set(p.timestamp, cur)
  }
  for (const p of x5 ?? []) {
    const cur = map.get(p.timestamp) ?? {}
    cur.v5 = p.value
    map.set(p.timestamp, cur)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, v]) => ({
      time: tsToTimeLabel(timestamp),
      s2: v.v2,
      s4: v.v4,
      s5: v.v5,
    }))
}

type Props = {
  alb: AlbMetrics | null
  metrics: MetricsState
  loading: boolean
}

export default function GwanjeAwsHttpDetailCards({ alb, metrics, loading }: Props) {
  const ts = alb?.timeseries
  const merged = mergeHttpCodes(ts?.['2xx'], ts?.['4xx'], ts?.['5xx'])
  const hasAlbHttp = merged.some((d) => d.s2 != null || d.s4 != null || d.s5 != null)

  const routeRows = [...metrics.routes]
    .filter((r) => r['4xx'] > 0 || r['5xx'] > 0)
    .sort((a, b) => b['4xx'] + b['5xx'] - (a['4xx'] + a['5xx']))
    .slice(0, MAX_ROUTES)

  const routeFallback = metrics.routes.length > 0 && routeRows.length === 0
  const displayRoutes = routeFallback
    ? [...metrics.routes].sort((a, b) => b.total - a.total).slice(0, MAX_ROUTES)
    : routeRows

  const showSkeleton = loading && !hasAlbHttp && metrics.routes.length === 0

  if (showSkeleton) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="HTTP 코드 (ALB 타깃)" subtitle="시계열" showActions={false}>
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
        </ChartCard>
        <ChartCard title="라우트별 4xx / 5xx (앱)" subtitle="Prometheus" showActions={false}>
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
        </ChartCard>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <ChartCard
        title="HTTP 코드 (ALB 타깃)"
        subtitle={
          alb?.alb_name
            ? `${alb.alb_name} · 버킷 합 건수 · 2xx는 왼쪽 축, 4xx/5xx는 오른쪽 축`
            : 'HTTPCode_Target_* · CloudWatch'
        }
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        {alb?.error ? (
          <p className="text-xs text-amber-800 py-6 text-center">{alb.error}</p>
        ) : !hasAlbHttp ? (
          <p className="text-xs text-gray-400 py-8 text-center">HTTPCode_Target 시계열이 없습니다.</p>
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merged} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9ca3af" interval="preserveStartEnd" />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10 }}
                  width={36}
                  label={{ value: '2xx', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#16a34a' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  width={36}
                  label={{ value: '4xx/5xx', angle: 90, position: 'insideRight', fontSize: 10, fill: '#ea580c' }}
                />
                <Tooltip
                  formatter={(v) => {
                    const n = typeof v === 'number' ? v : Number(v)
                    return Number.isFinite(n) ? `${Math.round(n)}건` : '—'
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="s2"
                  name="2xx"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="s4"
                  name="4xx"
                  stroke="#ca8a04"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="s5"
                  name="5xx"
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

      <ChartCard
        title="라우트별 4xx / 5xx (앱)"
        subtitle={
          routeFallback
            ? `에러가 있는 라우트가 없어 상위 ${MAX_ROUTES}개 · 누적 건수 기준`
            : `에러 발생 라우트 · 최대 ${MAX_ROUTES}개 · http_requests_total`
        }
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="prometheus" />
        </div>
        {metrics.routes.length === 0 ? (
          <p className="text-xs text-gray-400 py-8 text-center">라우트 메트릭이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-52 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-gray-50/95">
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-2 py-1.5 font-medium">엔드포인트</th>
                  <th className="px-2 py-1.5 font-medium text-right tabular-nums">4xx</th>
                  <th className="px-2 py-1.5 font-medium text-right tabular-nums">5xx</th>
                </tr>
              </thead>
              <tbody>
                {displayRoutes.map((r) => (
                  <tr key={r.endpoint} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-2 py-1.5 text-gray-800 max-w-[200px] truncate" title={r.endpoint}>
                      {r.endpoint}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-amber-800">{r['4xx']}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">{r['5xx']}</td>
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
