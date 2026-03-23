/**
 * AWS 리소스 탭 — 네트워크 세부: ECS RX/TX + ALB ProcessedBytes (MB/s)
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

function mergeRxTx(rx?: TsPoint[], tx?: TsPoint[]) {
  const map = new Map<string, { rx?: number; tx?: number }>()
  for (const p of rx ?? []) {
    const cur = map.get(p.timestamp) ?? {}
    cur.rx = p.value
    map.set(p.timestamp, cur)
  }
  for (const p of tx ?? []) {
    const cur = map.get(p.timestamp) ?? {}
    cur.tx = p.value
    map.set(p.timestamp, cur)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, v]) => ({
      time: tsToTimeLabel(timestamp),
      IN: v.rx,
      OUT: v.tx,
    }))
}

type Props = {
  alb: AlbMetrics | null
  loading: boolean
}

export default function GwanjeAwsNetworkDetailCards({ alb, loading }: Props) {
  if (alb?.error) {
    return (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        ALB 메트릭을 불러오지 못해 네트워크 세부 차트를 표시할 수 없습니다: {alb.error}
      </p>
    )
  }

  const rxTs = alb?.timeseries?.ecs_network_rx_mb_s
  const txTs = alb?.timeseries?.ecs_network_tx_mb_s
  const ecsChart = mergeRxTx(rxTs, txTs)
  const hasEcs = ecsChart.some((d) => d.IN != null || d.OUT != null)

  const procTs = alb?.timeseries?.alb_processed_mb_s
  const procChart =
    Array.isArray(procTs) && procTs.length > 0
      ? procTs.map((p) => ({
          time: tsToTimeLabel(p.timestamp),
          처리량: p.value,
        }))
      : []
  const hasProc = procChart.length > 0

  if (loading && !hasEcs && !hasProc) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="ECS 네트워크 (서비스)" subtitle="시계열" showActions={false}>
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
        </ChartCard>
        <ChartCard title="ALB 처리량" subtitle="시계열" showActions={false}>
          <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
        </ChartCard>
      </div>
    )
  }

  const ecsSvc = alb?.ecs_service ?? 'ECS'

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <ChartCard
        title="ECS 네트워크 I/O (서비스)"
        subtitle={`${ecsSvc} · MB/s (버킷 합÷간격) · NetworkRx / NetworkTx`}
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        {!hasEcs ? (
          <p className="text-xs text-gray-400 py-8 text-center">ECS 네트워크 시계열이 없습니다.</p>
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ecsChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9ca3af" interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={44}
                  label={{ value: 'MB/s', angle: 0, position: 'insideTopLeft', offset: 8, fontSize: 10, fill: '#6b7280' }}
                />
                <Tooltip
                  formatter={(v) => {
                    const n = typeof v === 'number' ? v : Number(v)
                    return Number.isFinite(n) ? `${n.toFixed(3)} MB/s` : '—'
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="IN" name="수신(IN)" stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="OUT" name="송신(OUT)" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="ALB 처리량 (ProcessedBytes)"
        subtitle={`${alb?.alb_name ?? 'ALB'} · MB/s — ECS 차트와 합산하지 않습니다`}
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        {!hasProc ? (
          <p className="text-xs text-gray-400 py-8 text-center">ProcessedBytes 시계열이 없습니다.</p>
        ) : (
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={procChart} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9ca3af" interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={44}
                  label={{ value: 'MB/s', angle: 0, position: 'insideTopLeft', offset: 8, fontSize: 10, fill: '#6b7280' }}
                />
                <Tooltip
                  formatter={(v) => {
                    const n = typeof v === 'number' ? v : Number(v)
                    return Number.isFinite(n) ? `${n.toFixed(3)} MB/s` : '—'
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="처리량"
                  name="처리량"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
