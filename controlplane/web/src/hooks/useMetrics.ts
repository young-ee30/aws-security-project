import { useState, useEffect, useRef, useCallback } from 'react'
import {
  parsePrometheus,
  parsePrometheusHelp,
  aggregateRequestsByRoute,
  calcPercentile,
  filterSamples,
  type MetricSample,
} from '@/lib/parsePrometheus'

// 브라우저 CORS 우회 — 로컬 대시보드 백엔드(4000)가 CloudFront에서 대신 가져옴
const DASHBOARD_BASE = (import.meta as any).env?.VITE_DASHBOARD_URL ?? 'http://localhost:4000'
const METRICS_URL = `${DASHBOARD_BASE}/dashboard/metrics/prometheus`

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

export interface NodeRuntime {
  rssBytes: number
  heapUsedBytes: number
  heapTotalBytes: number
  externalBytes: number
  cpuUserSec: number
  cpuSystemSec: number
  eventLoopLagMs: number
  eventLoopP50Ms: number
  eventLoopP90Ms: number
  eventLoopP99Ms: number
  gcMinorCount: number
  gcMajorCount: number
  gcMinorAvgMs: number
  gcMajorAvgMs: number
  activeHandles: number
  nodeVersion: string
}

/** 스냅샷 히스토리 기반 — 활성 핸들·대기 요청 추이(이름 없이 수치만) */
export interface HandlesRequestsTrendPoint {
  time: string
  handles: number
  requests: number
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
  runtime: NodeRuntime | null
  /** 최근 스냅샷들의 활성 핸들·active requests (관제 세부 지표용) */
  handlesRequestsTrend: HandlesRequestsTrendPoint[]
  // Prometheus 원문 스냅샷(HELP 설명 + 값)을 추가로 제공
  samples: MetricSample[]
  helpByName: Record<string, string>
}

// ── 스냅샷 타입 ────────────────────────────────────────────────────────────

interface Snapshot {
  ts: number
  samples: MetricSample[]
  byRoute: ReturnType<typeof aggregateRequestsByRoute>
}

// ── 런타임 파싱 헬퍼 ────────────────────────────────────────────────────────

function getGauge(samples: MetricSample[], name: string, labels?: Record<string, string>): number {
  const s = filterSamples(samples, name, labels)
  return s[0]?.value ?? 0
}

function parseRuntime(samples: MetricSample[]): NodeRuntime {
  const gcMinorCount = getGauge(samples, 'nodejs_gc_duration_seconds_count', { kind: 'minor' })
  const gcMajorCount = getGauge(samples, 'nodejs_gc_duration_seconds_count', { kind: 'major' })
  const gcMinorSumMs = getGauge(samples, 'nodejs_gc_duration_seconds_sum', { kind: 'minor' }) * 1000
  const gcMajorSumMs = getGauge(samples, 'nodejs_gc_duration_seconds_sum', { kind: 'major' }) * 1000

  return {
    rssBytes:        getGauge(samples, 'process_resident_memory_bytes'),
    heapUsedBytes:   getGauge(samples, 'nodejs_heap_size_used_bytes'),
    heapTotalBytes:  getGauge(samples, 'nodejs_heap_size_total_bytes'),
    externalBytes:   getGauge(samples, 'nodejs_external_memory_bytes'),
    cpuUserSec:      getGauge(samples, 'process_cpu_user_seconds_total'),
    cpuSystemSec:    getGauge(samples, 'process_cpu_system_seconds_total'),
    eventLoopLagMs:  getGauge(samples, 'nodejs_eventloop_lag_seconds') * 1000,
    eventLoopP50Ms:  getGauge(samples, 'nodejs_eventloop_lag_p50_seconds') * 1000,
    eventLoopP90Ms:  getGauge(samples, 'nodejs_eventloop_lag_p90_seconds') * 1000,
    eventLoopP99Ms:  getGauge(samples, 'nodejs_eventloop_lag_p99_seconds') * 1000,
    gcMinorCount,
    gcMajorCount,
    gcMinorAvgMs: gcMinorCount > 0 ? gcMinorSumMs / gcMinorCount : 0,
    gcMajorAvgMs: gcMajorCount > 0 ? gcMajorSumMs / gcMajorCount : 0,
    activeHandles:   getGauge(samples, 'nodejs_active_handles_total'),
    nodeVersion:     filterSamples(samples, 'nodejs_version_info')[0]?.labels?.version ?? '',
  }
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
    runtime: null,
    handlesRequestsTrend: [],
    samples: [],
    helpByName: {},
  })

  const fetchAndUpdate = useCallback(async () => {
    try {
      const res = await fetch(METRICS_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const samples = parsePrometheus(text)
      const helpByName = parsePrometheusHelp(text)
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

      const handlesRequestsTrend: HandlesRequestsTrendPoint[] = history.map((h) => ({
        time: new Date(h.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        handles: getGauge(h.samples, 'nodejs_active_handles_total'),
        requests: getGauge(h.samples, 'nodejs_active_requests_total'),
      }))

      const lastUpdated = new Date(now).toLocaleTimeString('ko-KR')
      const runtime = parseRuntime(samples)

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
        runtime,
        handlesRequestsTrend,
        samples,
        helpByName,
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
