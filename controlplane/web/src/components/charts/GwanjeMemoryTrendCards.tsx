/**
 * 관제 페이지 — ECS / RDS 메모리 시계열 (카드형 라인 차트)
 * ECS: MemoryUtilization % · RDS: FreeableMemory (MB)
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

function latestVal(pts: { value: number }[] | undefined): number | null {
  if (!pts?.length) return null
  const v = pts[pts.length - 1].value
  return Number.isFinite(v) ? v : null
}

function EcsMemCard({ data, loading }: { data: EcsMetrics | null; loading: boolean }) {
  const series = data?.memory
  const chartData =
    Array.isArray(series) && series.length > 0
      ? series.map((p) => ({
          time: tsToTimeLabel(p.timestamp),
          메모리: p.value,
        }))
      : []

  const last = latestVal(series)
  const maxVal = series?.length ? Math.max(...series.map(p => p.value)) : null
  const avgVal = series?.length ? series.reduce((s, p) => s + p.value, 0) / series.length : null

  if (loading && chartData.length === 0) {
    return (
      <ChartCard title="ECS 메모리 사용률" subtitle="시계열" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (chartData.length === 0) {
    return (
      <ChartCard title="ECS 메모리 사용률" subtitle="AWS/ECS · MemoryUtilization" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <p className="text-xs text-gray-400 py-8 text-center">메모리 시계열 데이터가 없습니다.</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="ECS 메모리 사용률"
      subtitle={data?.service ? `${data.service} · 5분 평균` : 'AWS/ECS · MemoryUtilization'}
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <StatBadge
            label="현재"
            value={last != null ? `${last.toFixed(1)}%` : '—'}
            color={last != null && last > 80 ? 'text-red-600' : last != null && last > 60 ? 'text-amber-600' : 'text-green-700'}
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
            <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '메모리']} contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={80} stroke="#fca5a5" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="메모리" name="Memory %" stroke="#16a34a" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

function RdsMemCard({ data, loading }: { data: RdsMetrics | null; loading: boolean }) {
  const series = data?.timeseries?.freeable_memory_mb
  const chartData =
    Array.isArray(series) && series.length > 0
      ? series.map((p) => ({
          time: tsToTimeLabel(p.timestamp),
          여유MB: p.value,
        }))
      : []

  const last = latestVal(series)
  const minVal = series?.length ? Math.min(...series.map(p => p.value)) : null
  const avgVal = series?.length ? series.reduce((s, p) => s + p.value, 0) / series.length : null

  if (loading && chartData.length === 0) {
    return (
      <ChartCard title="RDS 가용 메모리" subtitle="시계열" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (chartData.length === 0) {
    return (
      <ChartCard title="RDS 가용 메모리" subtitle="AWS/RDS · FreeableMemory" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <p className="text-xs text-gray-400 py-8 text-center">
          FreeableMemory 시계열이 없습니다. 대시보드 API를 최신으로 실행했는지 확인하세요.
        </p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="RDS 가용 메모리"
      subtitle={
        data?.db_identifier
          ? `${data.db_identifier} · FreeableMemory (MB)`
          : 'AWS/RDS · FreeableMemory'
      }
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <StatBadge
            label="현재"
            value={last != null ? `${last.toFixed(0)} MB` : '—'}
            color={last != null && last < 256 ? 'text-amber-700' : 'text-purple-700'}
          />
          <StatBadge
            label="최소"
            value={minVal != null ? `${minVal.toFixed(0)} MB` : '—'}
            color={minVal != null && minVal < 256 ? 'text-red-500' : 'text-gray-600'}
          />
          <StatBadge
            label="평균"
            value={avgVal != null ? `${avgVal.toFixed(0)} MB` : '—'}
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
            <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(v) => `${Math.round(v)}`} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(0)} MB`, '가용']}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="여유MB"
              name="Freeable (MB)"
              stroke="#c026d3"
              strokeWidth={2}
              dot={false}
            />
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

export default function GwanjeMemoryTrendCards({ ecs, rds, loading }: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <EcsMemCard data={ecs} loading={loading} />
      <RdsMemCard data={rds} loading={loading} />
    </div>
  )
}
