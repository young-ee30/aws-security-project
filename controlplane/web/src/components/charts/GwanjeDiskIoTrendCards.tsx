/**
 * 관제 페이지 — RDS 디스크 I/O 지연(시계열) + 스토리지 여유(도넛)
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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { RdsMetrics, TsPoint } from '@/hooks/useDashboardData'

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

function mergeReadWriteLatency(read?: TsPoint[], write?: TsPoint[]) {
  const map = new Map<string, { read?: number; write?: number }>()
  for (const p of read ?? []) {
    const cur = map.get(p.timestamp) ?? {}
    cur.read = p.value
    map.set(p.timestamp, cur)
  }
  for (const p of write ?? []) {
    const cur = map.get(p.timestamp) ?? {}
    cur.write = p.value
    map.set(p.timestamp, cur)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, v]) => ({
      time: tsToTimeLabel(timestamp),
      읽기지연: v.read,
      쓰기지연: v.write,
    }))
}

const PIE_USE = '#94a3b8'
const PIE_FREE = '#22c55e'

function RdsDiskIoLatencyCard({ rds, loading }: { rds: RdsMetrics | null; loading: boolean }) {
  const readTs = rds?.timeseries?.read_latency
  const writeTs = rds?.timeseries?.write_latency
  const chartData = mergeReadWriteLatency(readTs, writeTs)
  const hasAnyPoint = chartData.some((d) => d.읽기지연 != null || d.쓰기지연 != null)

  const lastRead =
    readTs?.length && Number.isFinite(readTs[readTs.length - 1].value)
      ? readTs[readTs.length - 1].value
      : null
  const lastWrite =
    writeTs?.length && Number.isFinite(writeTs[writeTs.length - 1].value)
      ? writeTs[writeTs.length - 1].value
      : null

  if (loading && !hasAnyPoint) {
    return (
      <ChartCard title="RDS 디스크 I/O 지연" subtitle="시계열" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (!hasAnyPoint) {
    return (
      <ChartCard title="RDS 디스크 I/O 지연" subtitle="AWS/RDS · ReadLatency · WriteLatency" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <p className="text-xs text-gray-400 py-8 text-center">디스크 I/O 지연 시계열 데이터가 없습니다.</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="RDS 디스크 I/O 지연"
      subtitle={
        rds?.db_identifier
          ? `${rds.db_identifier} · 평균 지연(ms) — IOPS와는 다른 지표`
          : 'AWS/RDS · ReadLatency · WriteLatency'
      }
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <StatBadge
            label="읽기 지연"
            value={lastRead != null ? `${lastRead.toFixed(2)} ms` : '—'}
            color={lastRead != null && lastRead > 20 ? 'text-red-600' : lastRead != null && lastRead > 5 ? 'text-amber-600' : 'text-teal-700'}
          />
          <StatBadge
            label="쓰기 지연"
            value={lastWrite != null ? `${lastWrite.toFixed(2)} ms` : '—'}
            color={lastWrite != null && lastWrite > 20 ? 'text-red-600' : lastWrite != null && lastWrite > 5 ? 'text-amber-600' : 'text-purple-700'}
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
              width={44}
              label={{ value: 'ms', angle: 0, position: 'insideTopLeft', offset: 8, fontSize: 10, fill: '#6b7280' }}
            />
            <Tooltip
              formatter={(v) => {
                const n = typeof v === 'number' ? v : Number(v)
                return Number.isFinite(n) ? `${n.toFixed(2)} ms` : '—'
              }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="읽기지연"
              name="읽기 지연"
              stroke="#0d9488"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="쓰기지연"
              name="쓰기 지연"
              stroke="#c026d3"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

function RdsDiskUsageDonutCard({ rds, loading }: { rds: RdsMetrics | null; loading: boolean }) {
  const total = rds?.current?.allocated_storage_gb
  const freeRaw = rds?.current?.free_storage_gb
  const canChart =
    typeof total === 'number' &&
    total > 0 &&
    typeof freeRaw === 'number' &&
    Number.isFinite(freeRaw) &&
    freeRaw >= 0

  const clampedFree = canChart ? Math.min(Math.max(0, freeRaw), total!) : 0
  const used = canChart ? Math.max(0, total! - clampedFree) : 0
  const pctFree = canChart && total! > 0 ? Math.round((clampedFree / total!) * 1000) / 10 : null

  const pieData =
    canChart && (used > 0 || clampedFree > 0)
      ? [
          { name: '사용', value: used, fill: PIE_USE },
          { name: '여유', value: clampedFree, fill: PIE_FREE },
        ].filter((d) => d.value > 0)
      : []

  if (loading && rds == null) {
    return (
      <ChartCard title="RDS 스토리지 여유" subtitle="할당 대비" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (!loading && !canChart) {
    return (
      <ChartCard title="RDS 스토리지 여유" subtitle="FreeStorageSpace · AllocatedStorage" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <p className="text-xs text-gray-500 py-6 text-center leading-relaxed">
          {typeof total !== 'number' || total <= 0
            ? 'RDS 할당 용량(DescribeDBInstances)을 가져오지 못했습니다. IAM에 rds:DescribeDBInstances 권한이 필요할 수 있습니다.'
            : 'CloudWatch FreeStorageSpace(여유 GB)를 확인할 수 없습니다.'}
        </p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="RDS 스토리지 여유"
      subtitle={
        rds?.db_identifier
          ? `${rds.db_identifier} · 프로비저닝 전체 대비 남은 공간`
          : 'FreeStorageSpace / AllocatedStorage'
      }
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs text-gray-600">
          전체 <strong className="tabular-nums text-gray-900">{total!.toFixed(1)} GB</strong>
          {' · '}
          여유 <strong className="tabular-nums text-emerald-700">{clampedFree.toFixed(1)} GB</strong>
          {' · '}
          사용 <strong className="tabular-nums text-slate-600">{used.toFixed(1)} GB</strong>
        </span>
        <SourceBadge source="cloudwatch" />
      </div>
      <div className="relative h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={1}
              stroke="#fff"
              strokeWidth={1}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => [`${Number(v).toFixed(1)} GB`, '']}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
        {pctFree != null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center pt-1">
              <p className="text-xl font-semibold tabular-nums text-gray-900">{pctFree}%</p>
              <p className="text-[10px] text-gray-500">남음</p>
            </div>
          </div>
        )}
      </div>
      {pctFree != null && pctFree < 15 && (
        <p className="text-[10px] text-amber-800 mt-1">여유가 15% 미만입니다. 용량 증설·정리를 검토하세요.</p>
      )}
    </ChartCard>
  )
}

type Props = {
  rds: RdsMetrics | null
  loading: boolean
}

export default function GwanjeDiskIoTrendCards({ rds, loading }: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <RdsDiskIoLatencyCard rds={rds} loading={loading} />
      <RdsDiskUsageDonutCard rds={rds} loading={loading} />
    </div>
  )
}
