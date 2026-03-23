/**
 * 침해 — AWS 리소스 로그 탭 요약
 * (CloudTrail·VPC Flow·WAF·GuardDuty·CloudWatch 알람)
 */
import { useMemo } from 'react'
import type { GwanjeInfraCard } from '@/hooks/useGwanjeInfraCards'
import type { DashboardData } from '@/hooks/useDashboardData'

function wafBlockedTotal(waf: DashboardData['wafMetrics']): number {
  if (!waf?.rules) return 0
  return Object.values(waf.rules).reduce((s, r) => s + (r?.total ?? 0), 0)
}

export function useHaeAwsLogCards(dash: DashboardData): {
  cards: GwanjeInfraCard[]
  loading: boolean
  error: string | null
} {
  const cards = useMemo(() => {
    const out: GwanjeInfraCard[] = []

    const trail = dash.cloudTrail ?? []
    out.push({
      id: 'hae-aws-cloudtrail',
      title: 'AWS CloudTrail',
      value: `${trail.length}건`,
      sub: 'LookupEvents 최근 수집(상한 적용)',
      source: 'cloudtrail',
    })

    const vpcN = dash.vpcLogs?.length ?? 0
    out.push({
      id: 'hae-aws-vpc-flow',
      title: 'VPC Flow Logs',
      value: `${vpcN}건`,
      sub: 'CloudWatch Logs 그룹 최근 스트림 샘플',
      source: 'cloudwatch',
    })

    const waf = dash.wafMetrics
    const blocked = wafBlockedTotal(waf)
    const ph = waf?.period_hours ?? 0
    out.push({
      id: 'hae-aws-waf',
      title: 'AWS WAF (차단)',
      value: `${Math.round(blocked)}회`,
      sub: waf ? `BlockedRequests 규칙 합 · 약 ${ph}h 창` : 'WAF 메트릭 없음',
      source: 'cloudwatch',
    })

    const gd = dash.guardDuty ?? []
    const high = gd.filter((g) => g.severity >= 7).length
    out.push({
      id: 'hae-aws-guardduty',
      title: 'GuardDuty (IDS/IPS)',
      value: `${gd.length}건`,
      sub: high > 0 ? `높음(≥7) ${high}건` : '탐지 샘플',
      source: 'cloudwatch',
    })

    const alarms = dash.alarms
    if (alarms) {
      out.push({
        id: 'hae-aws-cw-alarms',
        title: 'CloudWatch 알람 (관련)',
        value: `ALARM ${alarms.alarm_count}건`,
        sub: `전체 ${alarms.count}개 · 리소스 이상 신호`,
        source: 'cloudwatch',
      })
    } else if (!dash.loading) {
      out.push({
        id: 'hae-aws-cw-alarms',
        title: 'CloudWatch 알람 (관련)',
        value: '—',
        sub: '알람 목록 미수신',
        source: 'cloudwatch',
      })
    }

    return out
  }, [dash.cloudTrail, dash.vpcLogs, dash.wafMetrics, dash.guardDuty, dash.alarms, dash.loading])

  return {
    cards,
    loading: dash.loading,
    error: dash.error,
  }
}
