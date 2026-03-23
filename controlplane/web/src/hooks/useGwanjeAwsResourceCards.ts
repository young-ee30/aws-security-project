/**
 * 관제 페이지 · AWS 리소스 탭 — ALB / ECS CloudWatch 요약 카드
 */
import { useMemo } from 'react'
import type { GwanjeInfraCard } from '@/hooks/useGwanjeInfraCards'
import type { DashboardData } from '@/hooks/useDashboardData'
import type { MetricsState } from '@/hooks/useMetrics'

function bytesToMbLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const mb = bytes / 1024 / 1024
  return mb >= 100 ? `${mb.toFixed(0)} MB` : `${mb.toFixed(2)} MB`
}

export function useGwanjeAwsResourceCards(dash: DashboardData, metrics: MetricsState): {
  cards: GwanjeInfraCard[]
  loading: boolean
  error: string | null
} {
  const cards = useMemo(() => {
    const out: GwanjeInfraCard[] = []
    const alb = dash.albMetrics

    if (alb?.error) {
      if (!metrics.loading) {
        out.push({
          id: 'aws-rps-fallback',
          title: '요청 RPS',
          value: `${metrics.totalRps.toFixed(2)} /s`,
          sub: 'Prometheus(앱) — ALB CloudWatch를 불러오지 못했습니다',
          source: 'prometheus',
        })
      }
      return out
    }

    const c = alb?.current
    const period = alb?.period_sec ?? 300
    const ecsSvc = alb?.ecs_service ?? 'ECS'

    if (!c) {
      return out
    }

    out.push({
      id: 'aws-ecs-net-in',
      title: '네트워크 IN (ECS)',
      value: bytesToMbLabel(c.ecs_network_rx_bytes_last_bucket ?? 0),
      sub: `최근 ${period}s 버킷 합 · NetworkRxBytes · ${ecsSvc}`,
      source: 'cloudwatch',
    })
    out.push({
      id: 'aws-ecs-net-out',
      title: '네트워크 OUT (ECS)',
      value: bytesToMbLabel(c.ecs_network_tx_bytes_last_bucket ?? 0),
      sub: `최근 ${period}s 버킷 합 · NetworkTxBytes · ${ecsSvc}`,
      source: 'cloudwatch',
    })

    const rps = c.rps ?? 0
    out.push({
      id: 'aws-rps',
      title: '요청 RPS (ALB)',
      value: `${rps.toFixed(2)} /s`,
      sub: `RequestCount ÷ ${period}s · ${alb?.alb_name ?? 'ALB'}`,
      source: 'cloudwatch',
    })

    out.push({
      id: 'aws-http-codes',
      title: 'HTTP 상태 (ALB 타깃)',
      value: `2xx ${c.http_2xx_last_bucket ?? 0} · 4xx ${c.http_4xx_last_bucket ?? 0} · 5xx ${c.http_5xx_last_bucket ?? 0}`,
      sub: `최근 ${period}s 버킷 합 · HTTPCode_Target_*`,
      source: 'cloudwatch',
    })

    out.push({
      id: 'aws-alb-conn',
      title: '동시 연결 (ALB)',
      value: `${(c.active_connections ?? 0).toFixed(1)}`,
      sub: 'ActiveConnectionCount (평균)',
      source: 'cloudwatch',
    })

    out.push({
      id: 'aws-unhealthy',
      title: '비정상 타깃 (ALB)',
      value: `${c.unhealthy_hosts ?? 0}대`,
      sub: 'UnHealthyHostCount',
      source: 'cloudwatch',
    })

    return out
  }, [dash.albMetrics, metrics.loading, metrics.totalRps])

  const loading = dash.loading || metrics.loading
  const err = dash.error || metrics.error

  return { cards, loading, error: err }
}
