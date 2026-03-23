/**
 * 관제 페이지 · 인프라 데이터 탭 — CloudWatch / Prometheus 요약 카드
 */
import { useMemo } from 'react'
import { filterSamples } from '@/lib/parsePrometheus'
import type { TelemetrySource } from '@/data/monitoringIncidentMock'
import type { DashboardData } from '@/hooks/useDashboardData'
import type { MetricsState } from '@/hooks/useMetrics'

export interface GwanjeInfraCard {
  id: string
  title: string
  value: string
  sub?: string
  source: TelemetrySource
}

function latestTs(pts: { value: number }[] | undefined): number | null {
  if (!pts?.length) return null
  const v = pts[pts.length - 1].value
  return Number.isFinite(v) ? v : null
}

export function useGwanjeInfraCards(dash: DashboardData, metrics: MetricsState): {
  cards: GwanjeInfraCard[]
  loading: boolean
  error: string | null
} {
  const cards = useMemo(() => {
    const out: GwanjeInfraCard[] = []

    const ecs = dash.ecsMetrics
    const cpu = latestTs(ecs?.cpu)
    const mem = latestTs(ecs?.memory)
    if (cpu != null) {
      out.push({
        id: 'ecs-cpu',
        title: 'CPU 사용량 (ECS)',
        value: `${cpu.toFixed(1)}%`,
        sub: `${ecs?.service ?? '서비스'} · AWS/ECS`,
        source: 'cloudwatch',
      })
    }
    if (mem != null) {
      out.push({
        id: 'ecs-mem',
        title: '메모리 사용량 (ECS)',
        value: `${mem.toFixed(1)}%`,
        sub: 'MemoryUtilization',
        source: 'cloudwatch',
      })
    }

    const rds = dash.rdsMetrics
    const rc = rds?.current
    if (rc && typeof rc.free_storage_gb === 'number' && !Number.isNaN(rc.free_storage_gb)) {
      out.push({
        id: 'rds-disk-free',
        title: '디스크 여유 (RDS)',
        value: `${rc.free_storage_gb} GB`,
        sub: `${rds.db_identifier} · FreeStorageSpace`,
        source: 'cloudwatch',
      })
    }
    if (rc && (typeof rc.read_iops === 'number' || typeof rc.write_iops === 'number')) {
      const ri = typeof rc.read_iops === 'number' ? rc.read_iops : 0
      const wi = typeof rc.write_iops === 'number' ? rc.write_iops : 0
      out.push({
        id: 'rds-io',
        title: '디스크 I/O (RDS)',
        value: `읽기 ${ri} / 쓰기 ${wi} IOPS`,
        sub: 'ReadIOPS · WriteIOPS',
        source: 'cloudwatch',
      })
    }

    if (!metrics.loading) {
      const handles = filterSamples(metrics.samples, 'nodejs_active_handles_total')[0]?.value
      const reqs = filterSamples(metrics.samples, 'nodejs_active_requests_total')[0]?.value
      if (handles != null || reqs != null) {
        out.push({
          id: 'node-io',
          title: '활성 핸들 · 대기 요청',
          value: `${handles != null ? Math.round(handles) : '—'} / ${reqs != null ? Math.round(reqs) : '—'}`,
          sub: 'Node.js libuv (Prometheus) — OS 스레드와 다를 수 있음',
          source: 'prometheus',
        })
      }
    }

    const alb = dash.albMetrics
    const rt = alb?.current?.response_time_ms
    if (rt != null && rt > 0 && !alb?.error) {
      out.push({
        id: 'alb-latency',
        title: '서버 요청 응답 시간 (ALB)',
        value: `${Math.round(rt)} ms`,
        sub: alb?.alb_name ? `TargetResponseTime · ${alb.alb_name}` : 'TargetResponseTime',
        source: 'cloudwatch',
      })
    } else if (metrics.routes.length > 0) {
      const avg = metrics.routes.reduce((s, r) => s + r.p50, 0) / metrics.routes.length
      if (avg > 0) {
        out.push({
          id: 'http-p50',
          title: 'HTTP 응답 지연 (p50, 앱)',
          value: `${Math.round(avg)} ms`,
          sub: 'Prometheus http_request_duration_ms 라우트 평균',
          source: 'prometheus',
        })
      }
    }

    return out
  }, [dash, metrics])

  return {
    cards,
    loading: dash.loading || metrics.loading,
    error: dash.error || metrics.error,
  }
}
