import { useCallback, useMemo, useRef, useState } from 'react'
import { PageHeader } from '@/components/layout/Header'
import LogPageHeaderActions from '@/components/layout/LogPageHeaderActions'
import InfraAwsTabs, { type InfraAwsScope } from '@/components/common/InfraAwsTabs'
import InfraDataSummaryCards from '@/components/common/InfraDataSummaryCards'
import { useDashboardData } from '@/hooks/useDashboardData'
import { useMetrics } from '@/hooks/useMetrics'
import { useHaeInfraLogCards } from '@/hooks/useHaeInfraLogCards'
import { useHaeAwsLogCards } from '@/hooks/useHaeAwsLogCards'
import HaeAuthLogDetailSection from '@/components/charts/HaeAuthLogDetailSection'
import HaeAwsCloudTrailDetailCards from '@/components/charts/HaeAwsCloudTrailDetailCards'
import HaeAwsVpcFlowDetailCards from '@/components/charts/HaeAwsVpcFlowDetailCards'
import HaeAwsWafDetailCards from '@/components/charts/HaeAwsWafDetailCards'
import HaeAwsGuardDutyDetailCards from '@/components/charts/HaeAwsGuardDutyDetailCards'

/** 침해 — 인프라적 로그 / AWS 리소스 로그 · 요약 지표(CloudWatch·Prometheus·CloudTrail 범위) */
export default function IncidentHaePage() {
  const [scope, setScope] = useState<InfraAwsScope>('infra')
  const dash = useDashboardData()
  const metrics = useMetrics()
  const infraLog = useHaeInfraLogCards(dash, metrics)
  const awsLog = useHaeAwsLogCards(dash)

  const headerLoading = dash.loading || metrics.loading
  const lastUpdatedStr = useMemo(() => {
    if (headerLoading) return '불러오는 중…'
    if (dash.lastUpdated) return dash.lastUpdated.toLocaleTimeString('ko-KR')
    return metrics.lastUpdated !== '-' ? metrics.lastUpdated : '—'
  }, [headerLoading, dash.lastUpdated, metrics.lastUpdated])

  const haeAuthDetailRef = useRef<HTMLDivElement>(null)
  const haeAwsTrailDetailRef = useRef<HTMLDivElement>(null)
  const haeAwsVpcFlowDetailRef = useRef<HTMLDivElement>(null)
  const haeAwsWafDetailRef = useRef<HTMLDivElement>(null)
  const haeAwsGuardDutyDetailRef = useRef<HTMLDivElement>(null)
  const scrollToDetail = useCallback(
    (
      section:
        | 'cpu'
        | 'memory'
        | 'disk'
        | 'node'
        | 'alb'
        | 'awsNet'
        | 'awsRps'
        | 'awsHttp'
        | 'awsConn'
        | 'haeAuth'
        | 'haeAwsTrail'
        | 'haeAwsVpcFlow'
        | 'haeAwsWaf'
        | 'haeAwsGuardDuty',
    ) => {
      if (section === 'haeAuth') {
        haeAuthDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (section === 'haeAwsTrail') {
        haeAwsTrailDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (section === 'haeAwsVpcFlow') {
        haeAwsVpcFlowDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (section === 'haeAwsWaf') {
        haeAwsWafDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (section === 'haeAwsGuardDuty') {
        haeAwsGuardDutyDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [],
  )

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="침해"
        subtitle="침해 사고 측면에서 수집 가능한 로그·지표 요약입니다. CloudWatch·Prometheus·CloudTrail로 제공되는 범위만 표시합니다."
        lastUpdated={lastUpdatedStr}
        actions={<LogPageHeaderActions page="hae" />}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InfraAwsTabs
          value={scope}
          onChange={setScope}
          infraLabel="인프라적 로그"
          awsLabel="AWS 리소스 로그"
        />
        <p className="text-[11px] text-gray-500 max-w-xl">
          {scope === 'infra'
            ? 'ECS 로그 샘플, 앱 HTTP 에러(Prometheus), CloudTrail 인증 관련 이벤트 수입니다.'
            : 'CloudTrail·VPC Flow·WAF·GuardDuty·CloudWatch 알람 요약입니다.'}
        </p>
      </div>
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">요약 지표</h3>
        {scope === 'infra' ? (
          <InfraDataSummaryCards
            cards={infraLog.cards}
            loading={infraLog.loading}
            error={infraLog.error}
            detailLinkByCardId={{ 'hae-infra-auth': 'haeAuth' }}
            onScrollToDetail={scrollToDetail}
          />
        ) : (
          <InfraDataSummaryCards
            cards={awsLog.cards}
            loading={awsLog.loading}
            error={awsLog.error}
            detailLinkByCardId={{
              'hae-aws-cloudtrail': 'haeAwsTrail',
              'hae-aws-vpc-flow': 'haeAwsVpcFlow',
              'hae-aws-waf': 'haeAwsWaf',
              'hae-aws-guardduty': 'haeAwsGuardDuty',
            }}
            onScrollToDetail={scrollToDetail}
          />
        )}
      </section>
      {scope === 'infra' && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">세부 지표</h3>
          <div ref={haeAuthDetailRef} id="hae-detail-auth-trail" className="scroll-mt-4">
            <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
              인증·권한 로그 (CloudTrail)
            </h4>
            <p className="text-[11px] text-gray-500 mb-3">
              LookupEvents로 가져온 샘플에서 <strong className="font-medium text-gray-600">IAM·STS·콘솔 로그인</strong> 등에 해당하는
              이벤트만 모아 표시합니다. EventName 위험도는 키워드 기준 추정치입니다.
            </p>
            <HaeAuthLogDetailSection events={dash.cloudTrail} loading={dash.loading} />
          </div>
        </section>
      )}
      {scope === 'aws' && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">세부 지표</h3>
          <div ref={haeAwsTrailDetailRef} id="hae-detail-aws-cloudtrail" className="scroll-mt-4">
            <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
              AWS CloudTrail
            </h4>
            <p className="text-[11px] text-gray-500 mb-3">
              LookupEvents 샘플 전체를 기준으로 <strong className="font-medium text-gray-600">EventName 분포</strong>와{' '}
              <strong className="font-medium text-gray-600">최근 이벤트 목록</strong>을 봅니다. 인프라 탭의 인증·권한 필터와는
              별개입니다.
            </p>
            <HaeAwsCloudTrailDetailCards events={dash.cloudTrail} loading={dash.loading} />
          </div>
          <div ref={haeAwsVpcFlowDetailRef} id="hae-detail-aws-vpc-flow" className="scroll-mt-4 mt-10">
            <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
              VPC Flow Logs
            </h4>
            <p className="text-[11px] text-gray-500 mb-3">
              CloudWatch Logs에서 가져온 <strong className="font-medium text-gray-600">최근 스트림 샘플</strong>입니다. 허용/거절은
              원문 키워드 기준 추정치입니다.
            </p>
            <HaeAwsVpcFlowDetailCards logs={dash.vpcLogs} loading={dash.loading} />
          </div>
          <div ref={haeAwsWafDetailRef} id="hae-detail-aws-waf" className="scroll-mt-4 mt-10">
            <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">AWS WAF</h4>
            <p className="text-[11px] text-gray-500 mb-3">
              CloudWatch <strong className="font-medium text-gray-600">BlockedRequests</strong> 규칙별 합계입니다.
            </p>
            <HaeAwsWafDetailCards waf={dash.wafMetrics} loading={dash.loading} />
          </div>
          <div ref={haeAwsGuardDutyDetailRef} id="hae-detail-aws-guardduty" className="scroll-mt-4 mt-10">
            <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">GuardDuty</h4>
            <p className="text-[11px] text-gray-500 mb-3">
              <strong className="font-medium text-gray-600">ListFindings</strong> 샘플 기준 탐지 목록입니다.
            </p>
            <HaeAwsGuardDutyDetailCards findings={dash.guardDuty} loading={dash.loading} />
          </div>
        </section>
      )}
    </div>
  )
}
