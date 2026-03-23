/**
 * AWS 리소스 탭 — RPS 세부: ALB RequestCount 기반 추이 + Prometheus 라우트별 RPS
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
  BarChart,
  Bar,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { AlbMetrics } from '@/hooks/useDashboardData'
import type { MetricsState } from '@/hooks/useMetrics'

const MAX_ROUTES = 12

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

type Props = {
  alb: AlbMetrics | null
  metrics: MetricsState
  loading: boolean
}

export default function GwanjeAwsRpsDetailCards({ alb, metrics, loading }: Props) {
  const period = alb?.period_sec ?? 300
  const reqTs = alb?.timeseries?.request_count
  const albRpsData =
    Array.isArray(reqTs) && reqTs.length > 0
      ? reqTs.map((p) => ({
          time: tsToTimeLabel(p.timestamp),
          rps: period > 0 ? Math.round((p.value / period) * 1000) / 1000 : 0,
        }))
      : []

  const hasAlbRps = albRpsData.length > 0
  const routeBars = metrics.routes
    .slice(0, MAX_ROUTES)
    .map((r) => ({
      route: r.endpoint.length > 36 ? `${r.endpoint.slice(0, 34)}…` : r.endpoint,
      routeFull: r.endpoint,
      rps: r.rps,
    }))
  const hasRoutes = routeBars.length > 0

  const showSkeleton = loading && !hasAlbRps && !hasRoutes

  if (showSkeleton) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="ALB 요청 RPS" subtitle="시계열" showActions={false}>
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
        </ChartCard>
        <ChartCard title="라우트별 RPS (앱)" subtitle="Prometheus" showActions={false}>
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
        </ChartCard>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <ChartCard
        title="ALB 요청 RPS"
        subtitle={
          alb?.alb_name
            ? `${alb.alb_name} · RequestCount ÷ ${period}s (버킷마다)`
            : 'AWS/ApplicationELB · RequestCount'
        }
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        {alb?.error ? (
          <p className="text-xs text-amber-800 py-6 text-center">{alb.error}</p>
        ) : !hasAlbRps ? (
          <p className="text-xs text-gray-400 py-8 text-center">RequestCount 시계열이 없습니다.</p>
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={albRpsData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9ca3af" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={40} label={{ value: '/s', position: 'insideTopLeft', offset: 8, fontSize: 10, fill: '#6b7280' }} />
                <Tooltip
                  formatter={(v) => {
                    const n = typeof v === 'number' ? v : Number(v)
                    return [Number.isFinite(n) ? `${n.toFixed(2)} /s` : '—', 'RPS']
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="rps" name="ALB 요청 RPS" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="라우트별 RPS (앱)"
        subtitle={`최대 ${MAX_ROUTES}개 · 직전 스크랩 간격 대비 증가분으로 추정`}
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="prometheus" />
        </div>
        {!hasRoutes ? (
          <p className="text-xs text-gray-400 py-8 text-center">http_requests_total 라우트 데이터가 없습니다.</p>
        ) : (
          <div className="h-52 w-full -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={routeBars}
                layout="vertical"
                barSize={16}
                margin={{ top: 4, right: 20, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} stroke="#9ca3af" />
                <YAxis
                  type="category"
                  dataKey="route"
                  width={90}
                  tick={{ fontSize: 9 }}
                  stroke="#9ca3af"
                  interval={0}
                />
                <Tooltip
                  formatter={(v) => {
                    const n = typeof v === 'number' ? v : Number(v)
                    return [Number.isFinite(n) ? `${n.toFixed(2)} /s` : '—', 'RPS']
                  }}
                  labelFormatter={(_, p) => {
                    const row = p?.[0]?.payload as { routeFull?: string } | undefined
                    return row?.routeFull ?? ''
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="rps" name="RPS" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
