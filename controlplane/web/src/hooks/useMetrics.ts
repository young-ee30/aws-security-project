import { useState, useEffect, useRef, useCallback } from 'react'
import {
  parsePrometheus,
  aggregateRequestsByRoute,
  calcPercentile,
  type MetricSample,
} from '@/lib/parsePrometheus'

const METRICS_URL =
  (import.meta.env.VITE_METRICS_URL as string) ||
  'http://devsecops-dev-alb-1703008071.ap-northeast-2.elb.amazonaws.com/api/metrics'

const POLL_INTERVAL = 15_000 // 15초
const HISTORY_SIZE = 30     // 최대 30개 스냅샷

// ── 타입 정의 ──────────────────────────────────────────────────────────────

export interface RouteMetric {
  endpoint: string
  rps: number          // 초당 요청 수 (직전 스냅샷과의 delta)
  total: number        // 누적 요청 수
  '4xx': number
  '5xx': number
  errorRate: string    // "0.54%"
  p50: number
  p95: number
  p99: number
}

export interface TrendPoint {
  time: string
  [route: string]: number | string
}

export interface MetricsState {
  loading: boolean
  error: string | null
  lastUpdated: string
  totalRps: number
  total4xx: number
  total5xx: number
  routes: RouteMetric[]
  requestTrend: TrendPoint[]   // 시계열 (시간 순)
  errorBarData: Array<{ endpoint: string; '4xx': number; '5xx': number }>
}

// ── 스냅샷 타입 ────────────────────────────────────────────────────────────

interface Snapshot {
  ts: number
  samples: MetricSample[]
  byRoute: ReturnType<typeof aggregateRequestsByRoute>
}

// ── 훅 ────────────────────────────────────────────────────────────────────

export function useMetrics(): MetricsState {
  const historyRef = useRef<Snapshot[]>([])
  const [state, setState] = useState<MetricsState>({
    loading: true,
    error: null,
    lastUpdated: '-',
    totalRps: 0,
    total4xx: 0,
    total5xx: 0,
    routes: [],
    requestTrend: [],
    errorBarData: [],
  })

  const fetchAndUpdate = useCallback(async () => {
    try {
      const res = await fetch(METRICS_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const samples = parsePrometheus(text)
      const byRoute = aggregateRequestsByRoute(samples)
      const now = Date.now()

      const snap: Snapshot = { ts: now, samples, byRoute }
      historyRef.current = [...historyRef.current.slice(-(HISTORY_SIZE - 1)), snap]

      const history = historyRef.current
      const prev = history.length >= 2 ? history[history.length - 2] : null
      const intervalSec = prev ? (now - prev.ts) / 1000 : 15

      // ── 라우트별 집계 ──────────────────────────────────────────────────
      const routes: RouteMetric[] = Object.entries(byRoute)
        .filter(([r]) => r.startsWith('/api/') || r === '/')
        .map(([route, cur]) => {
          const prevRoute = prev?.byRoute[route]
          const delta = prevRoute ? Math.max(0, cur.total - prevRoute.total) : 0
          const rps = parseFloat((delta / intervalSec).toFixed(2))
          const errTotal = cur['4xx'] + cur['5xx']
          const errorRate = cur.total > 0 ? ((errTotal / cur.total) * 100).toFixed(2) + '%' : '0.00%'

          const p50 = calcPercentile(samples, 'http_request_duration_ms', { route }, 0.5)
          const p95 = calcPercentile(samples, 'http_request_duration_ms', { route }, 0.95)
          const p99 = calcPercentile(samples, 'http_request_duration_ms', { route }, 0.99)

          return {
            endpoint: route,
            rps,
            total: cur.total,
            '4xx': cur['4xx'],
            '5xx': cur['5xx'],
            errorRate,
            p50: Math.round(p50),
            p95: Math.round(p95),
            p99: Math.round(p99),
          }
        })
        .sort((a, b) => b.rps - a.rps)

      const totalRps = parseFloat(routes.reduce((s, r) => s + r.rps, 0).toFixed(2))
      const total4xx = routes.reduce((s, r) => s + r['4xx'], 0)
      const total5xx = routes.reduce((s, r) => s + r['5xx'], 0)

      // ── 시계열 추이 (history 기반) ─────────────────────────────────────
      const topRoutes = routes.slice(0, 5).map((r) => r.endpoint)

      const requestTrend: TrendPoint[] = history.map((h, i) => {
        const p = i > 0 ? history[i - 1] : null
        const iSec = p ? (h.ts - p.ts) / 1000 : 15
        const point: TrendPoint = {
          time: new Date(h.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
        for (const r of topRoutes) {
          const cur = h.byRoute[r]?.total ?? 0
          const prv = p?.byRoute[r]?.total ?? 0
          point[r] = parseFloat((Math.max(0, cur - prv) / iSec).toFixed(2))
        }
        return point
      })

      // ── 에러 바 데이터 ─────────────────────────────────────────────────
      const errorBarData = routes
        .filter((r) => r['4xx'] + r['5xx'] > 0)
        .map((r) => ({ endpoint: r.endpoint.replace('/api/', ''), '4xx': r['4xx'], '5xx': r['5xx'] }))

      const lastUpdated = new Date(now).toLocaleTimeString('ko-KR')

      setState({
        loading: false,
        error: null,
        lastUpdated,
        totalRps,
        total4xx,
        total5xx,
        routes,
        requestTrend,
        errorBarData,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'fetch 실패',
      }))
    }
  }, [])

  useEffect(() => {
    fetchAndUpdate()
    const timer = setInterval(fetchAndUpdate, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchAndUpdate])

  return state
}
