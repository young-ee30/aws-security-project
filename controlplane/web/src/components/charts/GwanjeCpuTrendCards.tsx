/**
 * 관제 페이지 — ECS / RDS CPU 사용률 시계열 (카드형 라인 차트)
 * 데이터: useDashboardData → CloudWatch GetMetricData
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
  ReferenceLine,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { EcsMetrics, RdsMetrics } from '@/hooks/useDashboardData'

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

function latestCpu(pts: { value: number }[] | undefined): number | null {
  if (!pts?.length) return null
  const v = pts[pts.length - 1].value
  return Number.isFinite(v) ? v : null
}

function StatBadge({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2.5 bg-gray-50 rounded-lg min-w-[80px]">
      <span className={`text-xl font-bold ${color ?? 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
      <span className="text-[11px] text-gray-500 mt-0.5">{label}</span>
    </div>
  )
}

function EcsCpuCard({ data, loading }: { data: EcsMetrics | null; loading: boolean }) {
  const series = data?.cpu
  const chartData =
    Array.isArray(series) && series.length > 0
      ? series.map((p) => ({
          time: tsToTimeLabel(p.timestamp),
          CPU: p.value,
        }))
      : []

  const last = latestCpu(series)
  const maxVal = series?.length ? Math.max(...series.map(p => p.value)) : null
  const avgVal = series?.length ? series.reduce((s, p) => s + p.value, 0) / series.length : null

  if (loading && chartData.length === 0) {
    return (
      <ChartCard title="ECS CPU 사용률" subtitle="시계열" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (chartData.length === 0) {
    return (
      <ChartCard title="ECS CPU 사용률" subtitle="AWS/ECS · CPUUtilization" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <p className="text-xs text-gray-400 py-8 text-center">CPU 시계열 데이터가 없습니다.</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="ECS CPU 사용률"
      subtitle={data?.service ? `${data.service} · 5분 평균` : 'AWS/ECS · CPUUtilization'}
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <StatBadge
            label="현재"
            value={last != null ? `${last.toFixed(1)}%` : '—'}
            color={last != null && last > 80 ? 'text-red-600' : last != null && last > 60 ? 'text-amber-600' : 'text-blue-700'}
          />
          <StatBadge
            label="최대"
            value={maxVal != null ? `${maxVal.toFixed(1)}%` : '—'}
            color={maxVal != null && maxVal > 80 ? 'text-red-500' : 'text-gray-600'}
          />
          <StatBadge
            label="평균"
            value={avgVal != null ? `${avgVal.toFixed(1)}%` : '—'}
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
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" width={36} />
            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'CPU']} contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={80} stroke="#fca5a5" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="CPU" name="CPU %" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

function RdsCpuCard({ data, loading }: { data: RdsMetrics | null; loading: boolean }) {
  const series = data?.timeseries?.cpu
  const chartData =
    Array.isArray(series) && series.length > 0
      ? series.map((p) => ({
          time: tsToTimeLabel(p.timestamp),
          CPU: p.value,
        }))
      : []

  const last = latestCpu(series)
  const maxVal = series?.length ? Math.max(...series.map(p => p.value)) : null
  const avgVal = series?.length ? series.reduce((s, p) => s + p.value, 0) / series.length : null

  if (loading && chartData.length === 0) {
    return (
      <ChartCard title="RDS CPU 사용률" subtitle="시계열" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (chartData.length === 0) {
    return (
      <ChartCard title="RDS CPU 사용률" subtitle="AWS/RDS · CPUUtilization" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <p className="text-xs text-gray-400 py-8 text-center">CPU 시계열 데이터가 없습니다.</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="RDS CPU 사용률"
      subtitle={data?.db_identifier ? `${data.db_identifier} · 5분 평균` : 'AWS/RDS · CPUUtilization'}
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <StatBadge
            label="현재"
            value={last != null ? `${last.toFixed(1)}%` : '—'}
            color={last != null && last > 80 ? 'text-red-600' : last != null && last > 60 ? 'text-amber-600' : 'text-orange-600'}
          />
          <StatBadge
            label="최대"
            value={maxVal != null ? `${maxVal.toFixed(1)}%` : '—'}
            color={maxVal != null && maxVal > 80 ? 'text-red-500' : 'text-gray-600'}
          />
          <StatBadge
            label="평균"
            value={avgVal != null ? `${avgVal.toFixed(1)}%` : '—'}
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
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" width={36} />
            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'CPU']} contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={80} stroke="#fca5a5" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="CPU" name="CPU %" stroke="#ea580c" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

type Props = {
  ecs: EcsMetrics | null
  rds: RdsMetrics | null
  loading: boolean
}

export default function GwanjeCpuTrendCards({ ecs, rds, loading }: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <EcsCpuCard data={ecs} loading={loading} />
      <RdsCpuCard data={rds} loading={loading} />
    </div>
  )
}
