/**
 * useDashboardData.ts
 * AWS 보안 로그 데이터 수집 훅 (CloudWatch / CloudTrail / GuardDuty)
 *
 * ※ Prometheus 메트릭은 useMetrics.ts 에서 별도 관리
 * ※ 대시보드 백엔드: controlplane/api/main.py (localhost:4000)
 */

import { useState, useEffect } from 'react'

const BASE = (import.meta as any).env?.VITE_DASHBOARD_URL ?? 'http://localhost:4000'
const REFRESH_MS = 30_000

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: number
  message: string
}

export interface TsPoint {
  timestamp: string
  value: number
}

export interface EcsMetrics {
  service: string
  cpu: TsPoint[]
  memory: TsPoint[]
}

export interface WafMetrics {
  period_hours: number
  rules: Record<string, { timeseries: TsPoint[]; total: number }>
}

export interface AlarmItem {
  name: string
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA'
  reason: string
  updated_at: string
  metric: string
  threshold: number
}

export interface AlarmsData {
  count: number
  alarm_count: number
  ok_count: number
  alarms: AlarmItem[]
}

export interface TrailEvent {
  event_time: string
  event_name: string
  event_source: string
  username: string
  source_ip: string
  resources: Array<{ type: string; name: string }>
}

export interface GdFinding {
  id: string
  title: string
  severity: number
  severity_label: string
  type: string
  updated_at: string
  region: string
}

export interface RdsMetrics {
  db_identifier: string
  current: {
    read_latency_ms: number
    write_latency_ms: number
    connections: number
    cpu_percent: number
    freeable_memory_mb: number
    /** FreeStorageSpace (GB) */
    free_storage_gb?: number
    /** DescribeDBInstances.AllocatedStorage (GB) — 원형 그래프(전체 대비 여유)용 */
    allocated_storage_gb?: number
    read_iops?: number
    write_iops?: number
  }
  timeseries: {
    read_latency: TsPoint[]
    write_latency: TsPoint[]
    connections: TsPoint[]
    cpu: TsPoint[]
    /** FreeableMemory (MB) — API 갱신 후 제공 */
    freeable_memory_mb?: TsPoint[]
  }
}

export interface AlbTargetHealth { name: string; healthy: number; total: number; port: number }
export interface AlbMetrics {
  /** ALB 미검색 시 등 */
  error?: string
  alb_name?: string
  /** CloudWatch 메트릭 버킷 길이(초) */
  period_sec?: number
  /** ECS 네트워크 지표에 쓴 서비스명 */
  ecs_service?: string
  current?: {
    healthy_hosts: number
    unhealthy_hosts: number
    response_time_ms: number
    /** ALB RequestCount / period_sec */
    rps?: number
    request_count_last_bucket?: number
    active_connections?: number
    http_2xx_last_bucket?: number
    http_4xx_last_bucket?: number
    http_5xx_last_bucket?: number
    ecs_network_rx_bytes_last_bucket?: number
    ecs_network_tx_bytes_last_bucket?: number
  }
  target_health?: AlbTargetHealth[]
  timeseries?: {
    request_count: TsPoint[]
    response_time: TsPoint[]
    '2xx'?: TsPoint[]
    '4xx': TsPoint[]
    '5xx': TsPoint[]
    /** MB/s (버킷당 바이트 합을 period로 나눈 뒤 MB) */
    ecs_network_rx_mb_s?: TsPoint[]
    ecs_network_tx_mb_s?: TsPoint[]
    alb_processed_mb_s?: TsPoint[]
    /** ActiveConnectionCount (Average) */
    active_connections?: TsPoint[]
    /** HealthyHostCount / UnHealthyHostCount (Average) */
    healthy_hosts?: TsPoint[]
    unhealthy_hosts?: TsPoint[]
    /** NewConnectionCount / RejectedConnectionCount (Sum, 버킷당) */
    new_connections?: TsPoint[]
    rejected_connections?: TsPoint[]
  }
}

export interface DashboardData {
  ecsLogs:    LogEntry[]
  vpcLogs:    LogEntry[]
  ecsMetrics: EcsMetrics | null
  wafMetrics: WafMetrics | null
  alarms:     AlarmsData | null
  cloudTrail: TrailEvent[]
  guardDuty:  GdFinding[]
  rdsMetrics: RdsMetrics | null
  albMetrics: AlbMetrics | null
  lastUpdated: Date | null
  loading:    boolean
  error:      string | null
}

// ─── 훅 ─────────────────────────────────────────────────────────────────────

export function useDashboardData(): DashboardData {
  const [data, setData] = useState<DashboardData>({
    ecsLogs: [], vpcLogs: [], ecsMetrics: null, wafMetrics: null,
    alarms: null, cloudTrail: [], guardDuty: [],
    rdsMetrics: null, albMetrics: null,
    lastUpdated: null, loading: true, error: null,
  })

  useEffect(() => {
    let alive = true

    async function load() {
      const [ecs, vpc, metrics, waf, alarms, trail, gd, rds, alb] = await Promise.allSettled([
        get('/dashboard/logs/api-node'),
        get('/dashboard/logs/vpc'),
        get('/dashboard/metrics/ecs?service_name=api-node&period=300&points=12'),
        get('/dashboard/metrics/waf?period=3600&points=24'),
        get('/dashboard/alarms'),
        get('/dashboard/cloudtrail?limit=20'),
        get('/dashboard/guardduty?limit=20'),
        get('/dashboard/metrics/rds'),
        get('/dashboard/metrics/alb'),
      ])

      if (!alive) return

      setData({
        ecsLogs:    ecs.status     === 'fulfilled' ? (ecs.value.logs     ?? []) : [],
        vpcLogs:    vpc.status     === 'fulfilled' ? (vpc.value.logs     ?? []) : [],
        ecsMetrics: metrics.status === 'fulfilled' ? metrics.value             : null,
        wafMetrics: waf.status     === 'fulfilled' ? waf.value                 : null,
        alarms:     alarms.status  === 'fulfilled' ? alarms.value              : null,
        cloudTrail: trail.status   === 'fulfilled' ? (trail.value.events ?? []) : [],
        guardDuty:  gd.status      === 'fulfilled' ? (gd.value.findings  ?? []) : [],
        rdsMetrics: rds.status     === 'fulfilled' ? rds.value                 : null,
        albMetrics: alb.status     === 'fulfilled' ? alb.value                 : null,
        lastUpdated: new Date(),
        loading: false,
        error: [ecs, vpc, metrics, waf, alarms, trail, gd, rds, alb].every(r => r.status === 'rejected')
          ? '대시보드 백엔드(localhost:4000)에 연결할 수 없습니다.'
          : null,
      })
    }

    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return data
}
