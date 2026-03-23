/**
 * 침해 — AWS 리소스 로그 탭 · VPC Flow Logs 세부
 * 통계 배지 + 원형 차트 + 프로토콜별 분포 + 로그 테이블
 */
import { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import ChartCard from '@/components/common/ChartCard'
import SourceBadge from '@/components/common/SourceBadge'
import type { LogEntry } from '@/hooks/useDashboardData'
import { vpcFlowActionCategory } from '@/lib/vpcFlowLog'

const MAX_ROWS = 25
const PROTO: Record<string, string> = { '6': 'TCP', '17': 'UDP', '1': 'ICMP' }

function formatLogTime(ts: number): { date: string; time: string } {
  if (!Number.isFinite(ts)) return { date: '—', time: '' }
  try {
    const d = new Date(ts)
    return {
      date: d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
      time: d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    }
  } catch {
    return { date: String(ts), time: '' }
  }
}

function formatBytes(b: number): string {
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`
  if (b >= 1_024)     return `${(b / 1_024).toFixed(1)} KB`
  return `${b} B`
}

function parseProto(message: string): string {
  const parts = message.trim().split(/\s+/)
  if (parts.length >= 8) return PROTO[parts[7]] ?? parts[7]
  return '—'
}

function parseBytes(message: string): number {
  const parts = message.trim().split(/\s+/)
  if (parts.length >= 10) return Number(parts[9]) || 0
  return 0
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

type Props = {
  logs: LogEntry[] | undefined
  loading: boolean
}

export default function HaeAwsVpcFlowDetailCards({ logs, loading }: Props) {
  const list = logs ?? []

  const stats = useMemo(() => {
    let accept = 0
    let reject = 0
    let other = 0
    let totalBytes = 0
    const protoCounts: Record<string, { total: number; reject: number }> = {}

    for (const row of list) {
      const msg = row.message || ''
      const cat = vpcFlowActionCategory(msg)
      if (cat === 'ACCEPT') accept++
      else if (cat === 'REJECT') reject++
      else other++

      totalBytes += parseBytes(msg)

      const proto = parseProto(msg)
      if (!protoCounts[proto]) protoCounts[proto] = { total: 0, reject: 0 }
      protoCounts[proto].total++
      if (cat === 'REJECT') protoCounts[proto].reject++
    }

    const total = list.length
    const rejectPct = total > 0 ? ((reject / total) * 100).toFixed(1) : '0.0'

    const minSlice = total > 0 ? total * 0.02 : 0.01
    const pieData = [
      { name: 'ACCEPT', real: accept, value: accept > 0 ? accept : minSlice, fill: '#22c55e' },
      { name: 'REJECT', real: reject, value: reject > 0 ? reject : minSlice, fill: reject > 0 ? '#ef4444' : '#d1d5db' },
      ...(other > 0 ? [{ name: '기타', real: other, value: other, fill: '#94a3b8' }] : []),
    ]

    return { accept, reject, other, total, rejectPct, totalBytes, pieData, protoCounts }
  }, [list])

  const sorted = useMemo(() => [...list].sort((a, b) => b.timestamp - a.timestamp), [list])

  if (loading && list.length === 0) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* 원형 차트 + 통계 배지 + 프로토콜 분포 */}
      <ChartCard
        title="허용 / 거절 분포"
        subtitle="원문에 ACCEPT·REJECT 키워드가 있으면 집계 · 형식이 다르면 기타"
        showActions={false}
      >
        <div className="flex justify-end mb-2">
          <SourceBadge source="cloudwatch" />
        </div>
        {list.length === 0 ? (
          <p className="text-xs text-gray-400 py-10 text-center">VPC Flow 로그 샘플이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {/* 통계 배지 */}
            <div className="flex flex-wrap gap-2">
              <StatBadge label="전체 트래픽" value={stats.total} sub="건" color="text-blue-700" />
              <StatBadge label="ACCEPT" value={stats.accept} sub="건" color="text-green-600" />
              <StatBadge
                label="REJECT"
                value={stats.reject}
                sub="건"
                color={stats.reject > 0 ? 'text-red-600' : 'text-gray-400'}
              />
              <StatBadge
                label="차단율"
                value={`${stats.rejectPct}%`}
                color={
                  parseFloat(stats.rejectPct) > 20
                    ? 'text-red-600'
                    : parseFloat(stats.rejectPct) > 5
                      ? 'text-amber-600'
                      : 'text-green-600'
                }
              />
              <StatBadge label="총 바이트" value={formatBytes(stats.totalBytes)} color="text-gray-600" />
            </div>
              {/* 도넛 차트 */}
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="72%"
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={1}
                    >
                      {stats.pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(_v: number, name: string) => {
                        const entry = stats.pieData.find(d => d.name === name)
                        const real = entry?.real ?? 0
                        const pct = stats.total > 0 ? ((real / stats.total) * 100).toFixed(1) : '0.0'
                        return [`${real}건 (${pct}%)`, name]
                      }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* 프로토콜별 분포 */}
              <div>
                <p className="text-[11px] text-gray-400 font-medium mb-1.5">프로토콜별 트래픽</p>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] text-gray-400 font-medium mb-1 px-1">
                  <span>프로토콜</span>
                  <span>ACCEPT</span>
                  <span>REJECT</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(stats.protoCounts)
                    .sort((a, b) => b[1].total - a[1].total)
                    .slice(0, 5)
                    .map(([proto, cnt]) => {
                      const acceptCnt = cnt.total - cnt.reject
                      return (
                        <div key={proto} className="grid grid-cols-3 gap-1.5 items-center rounded-lg bg-gray-50 px-2 py-1.5">
                          <span className="text-xs font-mono font-semibold text-gray-600">{proto}</span>
                          <span className="text-center text-sm font-bold text-green-600 tabular-nums">{acceptCnt}</span>
                          <span className={`text-center text-sm font-bold tabular-nums ${cnt.reject > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                            {cnt.reject}
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}
        </ChartCard>

        {/* 최근 로그 테이블 */}
        <ChartCard
          title="최근 로그"
          subtitle={`최신 순 · 최대 ${MAX_ROWS}줄 · CloudWatch Logs 스트림 샘플`}
          showActions={false}
        >
          <div className="flex justify-end mb-2">
            <SourceBadge source="cloudwatch" />
          </div>
          {sorted.length === 0 ? (
            <p className="text-xs text-gray-400 py-8 text-center">로그가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100 max-h-[min(380px,50vh)] overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-gray-50/95 z-[1]">
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="px-2 py-1.5 font-medium w-10">#</th>
                    <th className="px-2 py-1.5 font-medium whitespace-nowrap">시간</th>
                    <th className="px-2 py-1.5 font-medium">위험(추정)</th>
                    <th className="px-2 py-1.5 font-medium">원문</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, MAX_ROWS).map((row, i) => {
                    const cat = vpcFlowActionCategory(row.message || '')
                    const riskLabel =
                      cat === 'REJECT' ? '거절' : cat === 'ACCEPT' ? '허용' : '기타'
                    const riskClass =
                      cat === 'REJECT'
                        ? 'bg-rose-100 text-rose-900 border-rose-200'
                        : cat === 'ACCEPT'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                    return (
                      <tr key={`${row.timestamp}-${i}`} className="border-b border-gray-50 hover:bg-gray-50/50 align-top">
                        <td className="px-2 py-1.5 text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-2 py-1.5 tabular-nums">
                          {(() => { const t = formatLogTime(row.timestamp); return <><span className="block text-gray-500 text-[10px]">{t.date}</span><span className="block text-gray-700 text-[10px] whitespace-nowrap">{t.time}</span></> })()}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium border ${riskClass}`}>
                            {riskLabel}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-gray-800 font-mono text-[10px] break-all">
                          <span title={row.message}>{row.message || '—'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
  )
}
