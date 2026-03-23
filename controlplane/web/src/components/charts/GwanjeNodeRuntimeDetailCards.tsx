/**
 * 관제 페이지 — Prometheus(Node) 세부: 엔드포인트별 부하 표 + 활성 핸들·대기 요청 추이
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
import type { MetricsState } from '@/hooks/useMetrics'

const MAX_ROUTES = 12

function RouteTableCard({ metrics }: { metrics: MetricsState }) {
  const rows = metrics.routes.slice(0, MAX_ROUTES)

  if (metrics.loading && rows.length === 0) {
    return (
      <ChartCard title="HTTP 엔드포인트별 부하" subtitle="Prometheus · 최근 스냅샷 기준" showActions={false}>
        <div className="h-40 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (rows.length === 0) {
    return (
      <ChartCard title="HTTP 엔드포인트별 부하" subtitle="/api/* 라우트 메트릭" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="prometheus" />
        </div>
        <p className="text-xs text-gray-400 py-6 text-center">라우트별 요청 메트릭이 없습니다.</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="HTTP 엔드포인트별 부하"
      subtitle={`최대 ${MAX_ROUTES}개 · RPS는 직전 스크랩 간격 대비 증가분으로 추정`}
      showActions={false}
    >
      <div className="flex justify-end mb-2">
        <SourceBadge source="prometheus" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500">
              <th className="px-2 py-1.5 font-medium">엔드포인트</th>
              <th className="px-2 py-1.5 font-medium text-right tabular-nums">RPS</th>
              <th className="px-2 py-1.5 font-medium text-right tabular-nums">p50</th>
              <th className="px-2 py-1.5 font-medium text-right tabular-nums">p99</th>
              <th className="px-2 py-1.5 font-medium text-right tabular-nums">4xx</th>
              <th className="px-2 py-1.5 font-medium text-right tabular-nums">5xx</th>
              <th className="px-2 py-1.5 font-medium text-right">에러율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.endpoint} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-2 py-1.5 text-gray-800 max-w-[200px] truncate" title={r.endpoint}>
                  {r.endpoint}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-900">{r.rps.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{r.p50} ms</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{r.p99} ms</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{r['4xx']}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">{r['5xx']}</td>
                <td className="px-2 py-1.5 text-right text-gray-600">{r.errorRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 w-full max-w-[min(100%,26rem)] rounded-md border border-gray-100 bg-gray-50/70 px-3 py-1.5 text-left">
        <div className="space-y-1.5 text-[10px] leading-snug">
            <p className="text-gray-600">
              <span className="font-medium text-gray-700">RPS</span>
              <span className="text-gray-500"> : </span>
              초당 요청(추정, 스크랩 간격 대비 누적 증가분).
            </p>
            <p className="text-gray-600">
              <span className="font-medium text-gray-700">p50</span>
              <span className="text-gray-500"> : </span>
              응답시간 중앙값(ms), 절반/절반 기준.
            </p>
            <p className="text-gray-600">
              <span className="font-medium text-gray-700">p99</span>
              <span className="text-gray-500"> : </span>
              99백분위 응답시간(ms), 느린 요청(꼬리) 지표.
            </p>
            <p className="text-gray-600">
              <span className="font-medium text-gray-700">4xx · 5xx</span>
              <span className="text-gray-500"> : </span>
              해당 HTTP 상태 코드로 끝난 요청 건수.
            </p>
            <p className="text-gray-600">
              <span className="font-medium text-gray-700">에러율</span>
              <span className="text-gray-500"> : </span>
              (4xx+5xx)÷해당 경로 전체 요청.
            </p>
        </div>
      </div>
    </ChartCard>
  )
}

function HandlesRequestsTrendCard({ metrics }: { metrics: MetricsState }) {
  const data = metrics.handlesRequestsTrend
  const hasData = data.length > 0

  if (metrics.loading && !hasData) {
    return (
      <ChartCard title="활성 핸들 · 대기 요청 추이" subtitle="스냅샷 히스토리" showActions={false}>
        <div className="h-52 rounded-lg bg-gray-50 animate-pulse" />
      </ChartCard>
    )
  }

  if (!hasData) {
    return (
      <ChartCard title="활성 핸들 · 대기 요청 추이" subtitle="nodejs_active_*" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="prometheus" />
        </div>
        <p className="text-xs text-gray-400 py-8 text-center">히스토리가 쌓이면 그래프가 표시됩니다.</p>
      </ChartCard>
    )
  }

  const last = data[data.length - 1]

  return (
    <ChartCard
      title="활성 핸들 · 대기 요청 추이"
      subtitle="개별 리소스 이름은 노출하지 않고 수치만(최근 스냅샷 누적)"
      showActions={false}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs text-gray-600">
          최근: 핸들 <strong className="tabular-nums text-indigo-800">{last.handles.toFixed(0)}</strong>
          {' · '}
          대기 요청 <strong className="tabular-nums text-violet-800">{last.requests.toFixed(0)}</strong>
        </span>
        <SourceBadge source="prometheus" />
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke="#9ca3af" interval="preserveStartEnd" />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10 }}
              width={36}
              label={{ value: '핸들', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#6366f1' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10 }}
              width={40}
              label={{ value: '대기', angle: 90, position: 'insideRight', fontSize: 10, fill: '#7c3aed' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(v: number | string) => {
                const n = typeof v === 'number' ? v : Number(v)
                return Number.isFinite(n) ? n.toFixed(1) : String(v)
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="handles"
              name="활성 핸들"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="requests"
              name="대기 요청"
              stroke="#7c3aed"
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
  metrics: MetricsState
}

/** 요약 카드「활성 핸들 · 대기 요청」과 짝 — 라우트 표 + 추이 그래프 */
export default function GwanjeNodeRuntimeDetailCards({ metrics }: Props) {
  return (
    <div className="space-y-3">
      {metrics.error && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Prometheus 갱신 오류(이전 데이터를 보여 줄 수 있음): {metrics.error}
        </p>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RouteTableCard metrics={metrics} />
        <HandlesRequestsTrendCard metrics={metrics} />
      </div>
    </div>
  )
}
