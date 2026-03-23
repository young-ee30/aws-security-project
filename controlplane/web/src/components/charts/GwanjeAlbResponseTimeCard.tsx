/**
 * 관제 페이지 — ALB TargetResponseTime 시계열 (평균, ms)
 * CloudFront 이후 구간은 포함되지 않습니다(ALB↔타깃 위주).
 */
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { AlbMetrics } from '@/hooks/useDashboardData'

function StatBadge({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2.5 bg-gray-50 rounded-lg min-w-[80px]">
      <span className={`text-xl font-bold ${color ?? 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
      <span className="text-[11px] text-gray-500 mt-0.5">{label}</span>
    </div>
  )
}

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
  loading: boolean
}

export default function GwanjeAlbResponseTimeCard({ alb, loading }: Props) {
  const series = alb?.timeseries?.response_time
  const chartData =
    Array.isArray(series) && series.length > 0
      ? series.map((p) => ({
          time: tsToTimeLabel(p.timestamp),
          ms: p.value,
        }))
      : []

  const last =
    series?.length && Number.isFinite(series[series.length - 1].value)
      ? series[series.length - 1].value
      : null
  const maxVal = series?.length ? Math.max(...series.map(p => p.value)) : null
  const avgVal = series?.length ? series.reduce((s, p) => s + p.value, 0) / series.length : null

  if (alb?.error) {
    return (
      <ChartCard title="ALB 응답 시간" subtitle="TargetResponseTime" showActions={false}>
        <p className="text-xs text-amber-800 py-4">{alb.error}</p>
      </ChartCard>
    )
  }

  if (loading && chartData.length === 0) {
    return (
      <ChartCard title="ALB 응답 시간" subtitle="시계열" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (chartData.length === 0) {
    return (
      <ChartCard title="ALB 응답 시간" subtitle="AWS/ApplicationELB · TargetResponseTime" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <p className="text-xs text-gray-400 py-8 text-center">TargetResponseTime 시계열 데이터가 없습니다.</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="ALB 응답 시간"
      subtitle={
        alb?.alb_name
          ? `${alb.alb_name} · 평균(ms) — 브라우저·CloudFront 구간 미포함`
          : 'AWS/ApplicationELB · TargetResponseTime'
      }
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <StatBadge
            label="현재"
            value={last != null ? `${last.toFixed(1)} ms` : '—'}
            color={last != null && last > 500 ? 'text-red-600' : last != null && last > 200 ? 'text-amber-600' : 'text-indigo-700'}
          />
          <StatBadge
            label="최대"
            value={maxVal != null ? `${maxVal.toFixed(1)} ms` : '—'}
            color={maxVal != null && maxVal > 500 ? 'text-red-500' : 'text-gray-600'}
          />
          <StatBadge
            label="평균"
            value={avgVal != null ? `${avgVal.toFixed(1)} ms` : '—'}
            color="text-gray-600"
          />
        </div>
        <SourceBadge source="cloudwatch" />
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#9ca3af" interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 10 }}
              width={40}
              label={{ value: 'ms', angle: 0, position: 'insideTopLeft', offset: 8, fontSize: 10, fill: '#6b7280' }}
            />
            <Tooltip
              formatter={(v) => {
                const n = typeof v === 'number' ? v : Number(v)
                return [Number.isFinite(n) ? `${n.toFixed(1)} ms` : '—', '평균']
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Line type="monotone" dataKey="ms" name="응답 시간" stroke="#4f46e5" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
