/**
 * PrometheusHttpCard.tsx
 * HTTP 트래픽 보안 현황 — Prometheus 기반
 * 데이터 소스: GET /api/metrics (CloudFront → Node.js)
 *
 * 포함 내용:
 *  - 요약: 총 요청수 / RPS / 4xx 에러 / 5xx 에러 / 에러율
 *  - 요청 추이 라인 차트 (라우트별 RPS)
 *  - 라우트별 레이턴시 테이블 (누적 요청 / 에러율 / P50 / P95 / P99)
 */

import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import { type MetricsState } from '@/hooks/useMetrics'

interface Props {
  metrics: MetricsState
}

const ROUTE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444']

function StatBadge({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2.5 bg-gray-50 rounded-lg min-w-[80px]">
      <span className={`text-xl font-bold ${color ?? 'text-gray-800'}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
      <span className="text-[11px] text-gray-500 mt-0.5">{label}</span>
    </div>
  )
}

export default function PrometheusHttpCard({ metrics }: Props) {
  const { loading, error, routes, requestTrend, totalRps, total4xx, total5xx } = metrics

  const totalReqs = routes.reduce((s, r) => s + r.total, 0)
  const overallErrRate = totalReqs > 0
    ? (((total4xx + total5xx) / totalReqs) * 100).toFixed(2)
    : '0.00'

  const topRoutes = routes.slice(0, 5)

  if (loading) {
    return (
      <ChartCard title="Prometheus — HTTP 트래픽 보안 현황" subtitle="데이터 로딩 중...">
        <p className="text-xs text-gray-400 py-6 text-center">Prometheus 엔드포인트 연결 중...</p>
      </ChartCard>
    )
  }

  if (error) {
    return (
      <ChartCard title="Prometheus — HTTP 트래픽 보안 현황" subtitle="연결 오류">
        <p className="text-xs text-red-500 py-6 text-center">⚠ {error}</p>
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="Prometheus — HTTP 트래픽 보안 현황"
      subtitle={`Node.js api-node | 갱신: ${metrics.lastUpdated}`}
    >
      {/* 요약 수치 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <StatBadge label="총 요청"   value={totalReqs.toLocaleString()} color="text-blue-700" />
        <StatBadge label="RPS(req/s)"  value={totalRps}            color="text-indigo-600" />
        <StatBadge label="4xx 에러"  value={total4xx}               color={total4xx > 0 ? 'text-amber-600' : 'text-gray-400'} />
        <StatBadge label="5xx 에러"  value={total5xx}               color={total5xx > 0 ? 'text-red-600'   : 'text-gray-400'} />
        <StatBadge label="에러율"    value={`${overallErrRate}%`}   color={parseFloat(overallErrRate) > 1 ? 'text-red-600' : 'text-green-600'} />
      </div>

      {/* 요청 추이 라인 차트 */}
      {requestTrend.length > 1 ? (
        <>
          <p className="text-[11px] text-gray-400 font-medium mb-1">엔드포인트별 RPS 추이</p>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={requestTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} unit=" r/s" />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {topRoutes.map((r, i) => (
                <Line
                  key={r.endpoint}
                  type="monotone"
                  dataKey={r.endpoint}
                  stroke={ROUTE_COLORS[i]}
                  dot={false}
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      ) : (
        <p className="text-[11px] text-gray-400 py-2 text-center">
          RPS 추이 수집 중... (15초마다 갱신)
        </p>
      )}

      {/* 라우트별 레이턴시 테이블 */}
      {routes.length > 0 && (
        <>
          <p className="text-[11px] text-gray-400 font-medium mt-4 mb-1">라우트별 응답 시간 분석</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-left py-1.5 pr-3 font-medium">엔드포인트</th>
                  <th className="text-right py-1.5 pr-3 font-medium">누적 요청</th>
                  <th className="text-right py-1.5 pr-3 font-medium">에러율</th>
                  <th className="text-right py-1.5 pr-3 font-medium">P50</th>
                  <th className="text-right py-1.5 pr-3 font-medium">P95</th>
                  <th className="text-right py-1.5 font-medium">P99</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => {
                  const errPct = parseFloat(r.errorRate)
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 pr-3 font-mono text-blue-700">{r.endpoint}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{r.total.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          errPct > 5  ? 'bg-red-100 text-red-700' :
                          errPct > 1  ? 'bg-amber-100 text-amber-700' :
                                        'bg-green-100 text-green-700'
                        }`}>
                          {r.errorRate}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{r.p50}ms</td>
                      <td className="py-1.5 pr-3 text-right text-gray-600">{r.p95}ms</td>
                      <td className="py-1.5 text-right text-gray-600">{r.p99}ms</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ChartCard>
  )
}
