import { PageHeader } from '@/components/layout/Header'
import MetricCard from '@/components/common/MetricCard'
import ChartCard from '@/components/common/ChartCard'
import { useMetrics } from '@/hooks/useMetrics'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'

const ROUTE_COLORS = ['#facc15', '#4ade80', '#22d3ee', '#a78bfa', '#f472b6']

export default function AppHttpPage() {
  const m = useMetrics()
  const topRoutes = m.routes.slice(0, 5)

  return (
    <div>
      <PageHeader
        title="앱/HTTP 세부 모니터링"
        subtitle="RED 방식 — Rate · Error · Duration"
        lastUpdated={m.lastUpdated}
      />

      {m.error && (
        <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          메트릭 수집 실패: {m.error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard title="전체 초당 요청" value={m.totalRps} unit="req/s" />
        <MetricCard title="HTTP 4xx 에러 (누적)" value={m.total4xx} unit="건" valueColor="orange" />
        <MetricCard title="HTTP 5xx 에러 (누적)" value={m.total5xx} unit="건" valueColor="red" />
      </div>

      {/* Rate Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Rate — 현재 RPS" subtitle="라우트별 초당 요청 수">
          <div className="space-y-3">
            {m.loading ? (
              <div className="text-sm text-gray-400 text-center py-8">로딩 중...</div>
            ) : topRoutes.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8">데이터 없음</div>
            ) : topRoutes.map((item, index) => (
              <div key={item.endpoint} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ROUTE_COLORS[index] }} />
                  <span className="text-sm text-gray-700 truncate max-w-[140px]">{item.endpoint}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{item.rps}</span>
                  {item.rps > 0
                    ? <TrendingUp className="w-4 h-4 text-rose-500" />
                    : <TrendingDown className="w-4 h-4 text-blue-400" />}
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard title="Rate — 요청 추이 (최근 30 스냅샷, 15초 간격)" subtitle="라우트별 req/s">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={m.requestTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(v) => `${v}r/s`} />
                  <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} iconType="circle" iconSize={8} />
                  {topRoutes.map((r, i) => (
                    <Line key={r.endpoint} type="monotone" dataKey={r.endpoint} stroke={ROUTE_COLORS[i]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Error Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Error — 라우트별 에러 건수" subtitle="4xx / 5xx 누적 카운트">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.errorBarData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="endpoint" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" iconSize={8} />
                <Bar dataKey="4xx" fill="#fb923c" radius={[4, 4, 0, 0]} name="4xx" />
                <Bar dataKey="5xx" fill="#f43f5e" radius={[4, 4, 0, 0]} name="5xx" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Error — 엔드포인트별 에러율" subtitle="4xx / 5xx 비율 분석">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500">엔드포인트</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-amber-600">4xx</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-rose-600">5xx</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-gray-500">에러율</th>
                </tr>
              </thead>
              <tbody>
                {m.routes.slice(0, 8).map((item, index) => (
                  <tr key={index} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 px-2 text-xs text-gray-700 truncate max-w-[150px]">{item.endpoint}</td>
                    <td className="py-2 px-2 text-xs text-right font-medium text-amber-600">{item['4xx']}</td>
                    <td className="py-2 px-2 text-xs text-right font-medium text-rose-600">{item['5xx']}</td>
                    <td className="py-2 px-2 text-xs text-right text-gray-500">{item.errorRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* Duration Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Duration — P50 / P95 / P99" subtitle="라우트별 응답 시간 (ms)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topRoutes.map((r) => ({
                  endpoint: r.endpoint.replace('/api/', ''),
                  P50: r.p50,
                  P95: r.p95,
                  P99: r.p99,
                }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="endpoint" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tickFormatter={(v) => `${v}ms`} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} formatter={(v: number) => [`${v} ms`]} />
                <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" iconSize={8} />
                <Bar dataKey="P50" fill="#34d399" radius={[4, 4, 0, 0]} />
                <Bar dataKey="P95" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                <Bar dataKey="P99" fill="#f472b6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Duration — 엔드포인트별 상세" subtitle="응답 시간 분포">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500">엔드포인트</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-emerald-600">P50</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-blue-600">P95</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-pink-600">P99</th>
                </tr>
              </thead>
              <tbody>
                {m.routes.slice(0, 8).map((item, index) => (
                  <tr key={index} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 px-2 text-xs text-gray-700 truncate max-w-[150px]">{item.endpoint}</td>
                    <td className="py-2 px-2 text-xs text-right font-medium text-emerald-600">{item.p50} ms</td>
                    <td className="py-2 px-2 text-xs text-right font-medium text-blue-600">{item.p95} ms</td>
                    <td className="py-2 px-2 text-xs text-right font-medium text-pink-600">{item.p99} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
