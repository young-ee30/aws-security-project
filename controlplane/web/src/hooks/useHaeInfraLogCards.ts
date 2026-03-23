/**
 * 침해 — 인프라적 로그 탭 요약
 * (CloudWatch Logs 샘플·CloudTrail·Prometheus로 얻을 수 있는 범위만)
 */
import { useMemo } from 'react'
import { isAuthRelatedTrailEvent } from '@/lib/cloudTrailAuth'
import type { GwanjeInfraCard } from '@/hooks/useGwanjeInfraCards'
import type { DashboardData } from '@/hooks/useDashboardData'
import type { MetricsState } from '@/hooks/useMetrics'

export function useHaeInfraLogCards(dash: DashboardData, metrics: MetricsState): {
  cards: GwanjeInfraCard[]
  loading: boolean
  error: string | null
} {
  const cards = useMemo(() => {
    const out: GwanjeInfraCard[] = []
    const trail = dash.cloudTrail ?? []
    const authN = trail.filter(isAuthRelatedTrailEvent).length

    out.push({
      id: 'hae-infra-auth',
      title: '인증·권한 로그 (Auth)',
      value: `${authN}건`,
      sub: `CloudTrail 샘플 ${trail.length}건 중 · IAM/STS/콘솔 로그인 등 키워드 매칭`,
      source: 'cloudtrail',
    })

    out.push({
      id: 'hae-infra-rps',
      title: '추정 RPS (앱)',
      value: `${metrics.totalRps.toFixed(2)} /s`,
      sub: 'http_requests_total 기반 라우트 합 · 스냅샷 간격 기준',
      source: 'prometheus',
    })

    const ecsN = dash.ecsLogs?.length ?? 0
    out.push({
      id: 'hae-infra-appsec',
      title: '애플리케이션 보안 (HTTP·로그)',
      value: `4xx ${metrics.total4xx} · 5xx ${metrics.total5xx}`,
      sub: `Prometheus 누적 · ECS api-node 로그 샘플 ${ecsN}줄`,
      source: 'prometheus',
    })

    const rt = metrics.runtime

    out.push({
      id: 'hae-infra-eventloop-p99',
      title: 'Node 이벤트 루프 지연 (p99)',
      value: rt ? `${Math.round(rt.eventLoopP99Ms)} ms` : '—',
      sub: rt ? 'nodejs_eventloop_lag_p99_seconds · 블로킹·부하 보조' : '런타임 메트릭 미수신',
      source: 'prometheus',
    })

    return out
  }, [
    dash.cloudTrail,
    dash.ecsLogs,
    metrics.total4xx,
    metrics.total5xx,
    metrics.totalRps,
    metrics.runtime,
  ])

  return {
    cards,
    loading: dash.loading || metrics.loading,
    error: dash.error || metrics.error,
  }
}
