/**
 * 침해 — AWS WAF 세부 (2카드 가로 배치: 규칙별 차단 막대 + 규칙 요약 표)
 */
import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { WafMetrics } from '@/hooks/useDashboardData'

type Props = {
  waf: WafMetrics | null | undefined
  loading: boolean
}

export default function HaeAwsWafDetailCards({ waf, loading }: Props) {
  const { rows, chartData } = useMemo(() => {
    const rules = waf?.rules
    if (!rules) return { rows: [] as { name: string; total: number }[], chartData: [] as { name: string; total: number }[] }
    const list = Object.entries(rules).map(([name, r]) => ({
      name,
      total: r?.total ?? 0,
    }))
    list.sort((a, b) => b.total - a.total)
    return { rows: list, chartData: list }
  }, [waf])

  const showSkeleton = loading && !waf

  if (showSkeleton) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!waf || rows.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-6 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
        WAF 메트릭이 없습니다.
      </p>
    )
  }

  const periodH = waf.period_hours ?? 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
      <ChartCard
        title="규칙별 차단 (BlockedRequests)"
        subtitle={`합계 · 약 ${periodH}h 창 · CloudFront WAF`}
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 9 }}
                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 14)}…` : v)}
              />
              <Tooltip formatter={(v: number) => [`${v}회`, '차단']} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" name="차단" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#ea580c' : '#fb923c'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="규칙 요약" subtitle="BlockedRequests 합계" showActions={false}>
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50/95">
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="px-2 py-1.5 font-medium">규칙(라벨)</th>
                <th className="px-2 py-1.5 font-medium text-right tabular-nums">차단 합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-2 py-1.5 text-gray-800 font-mono text-[10px]">{r.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-orange-900">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}
