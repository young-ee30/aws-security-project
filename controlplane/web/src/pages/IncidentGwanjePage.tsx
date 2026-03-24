import { useCallback, useMemo, useRef, useState } from 'react'
import IncidentAiSummaryDialog from '@/components/incident/IncidentAiSummaryDialog'
import { PageHeader } from '@/components/layout/Header'
import LogPageHeaderActions from '@/components/layout/LogPageHeaderActions'
import InfraAwsTabs, { type InfraAwsScope } from '@/components/common/InfraAwsTabs'
import InfraDataSummaryCards from '@/components/common/InfraDataSummaryCards'
import GwanjeCpuTrendCards from '@/components/charts/GwanjeCpuTrendCards'
import GwanjeMemoryTrendCards from '@/components/charts/GwanjeMemoryTrendCards'
import GwanjeDiskIoTrendCards from '@/components/charts/GwanjeDiskIoTrendCards'
import GwanjeNodeRuntimeDetailCards from '@/components/charts/GwanjeNodeRuntimeDetailCards'
import GwanjeAlbResponseTimeCard from '@/components/charts/GwanjeAlbResponseTimeCard'
import { useDashboardData, type DashboardData } from '@/hooks/useDashboardData'
import { useMetrics, type MetricsState } from '@/hooks/useMetrics'
import { useGwanjeInfraCards, type GwanjeInfraCard } from '@/hooks/useGwanjeInfraCards'
import { useGwanjeAwsResourceCards } from '@/hooks/useGwanjeAwsResourceCards'
import GwanjeAwsNetworkDetailCards from '@/components/charts/GwanjeAwsNetworkDetailCards'
import GwanjeAwsRpsDetailCards from '@/components/charts/GwanjeAwsRpsDetailCards'
import GwanjeAwsHttpDetailCards from '@/components/charts/GwanjeAwsHttpDetailCards'
import GwanjeAwsConnectionHealthDetailCards from '@/components/charts/GwanjeAwsConnectionHealthDetailCards'
import LogsMetricsErrorBoundary from '@/components/LogsMetricsErrorBoundary'
import PrometheusHttpCard from '@/components/charts/PrometheusHttpCard'
import {
  requestIncidentAiAnalysis,
  type IncidentAiAnalysisRequest,
  type IncidentAiAnalysisResponse,
  type IncidentAiLogLine,
  type IncidentAiSeverity,
} from '@/lib/incidentAi'
import { exportIncidentReport } from '@/lib/incidentReport'

function formatTimestamp(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return undefined
  }

  const epochMs = value > 1_000_000_000_000 ? value : value * 1000
  return new Date(epochMs).toLocaleString('ko-KR')
}

function inferMonitoringSeverity(text: string): IncidentAiSeverity {
  const lower = text.toLowerCase()

  if (/error|fatal|panic|exception|5xx|unhealthy|timeout|failed|alarm/i.test(lower)) {
    return 'error'
  }

  if (/warn|warning|retry|lag|latency|high|spike|burst/i.test(lower)) {
    return 'warn'
  }

  return 'info'
}

function normalizeCards(cards: GwanjeInfraCard[]) {
  return cards.slice(0, 16).map((card) => ({
    title: card.title,
    value: card.value,
    sub: card.sub,
    source: card.source,
  }))
}

function buildGwanjeAnalysisRequest(
  dash: DashboardData,
  metrics: MetricsState,
  infraCards: GwanjeInfraCard[],
  awsCards: GwanjeInfraCard[],
  lastUpdated: string,
): IncidentAiAnalysisRequest {
  const logLines: IncidentAiLogLine[] = [
    ...dash.ecsLogs.slice(0, 20).map((log) => ({
      time: formatTimestamp(log.timestamp),
      text: log.message,
      severity: inferMonitoringSeverity(log.message),
      source: 'cloudwatch',
    })),
    ...dash.vpcLogs.slice(0, 20).map((log) => ({
      time: formatTimestamp(log.timestamp),
      text: log.message,
      severity: inferMonitoringSeverity(log.message),
      source: 'cloudwatch',
    })),
    ...(dash.alarms?.alarms || []).slice(0, 8).map((alarm) => ({
      time: alarm.updated_at,
      text: `${alarm.name} ${alarm.state}: ${alarm.reason}`,
      severity: (alarm.state === 'ALARM' ? 'error' : 'warn') as IncidentAiSeverity,
      source: 'cloudwatch',
    })),
    ...metrics.routes.slice(0, 8).map((route) => ({
      time: metrics.lastUpdated,
      text: `${route.endpoint} RPS ${route.rps}, 4xx ${route['4xx']}, 5xx ${route['5xx']}, p95 ${route.p95}ms`,
      severity: (route['5xx'] > 0 ? 'error' : route['4xx'] > 0 ? 'warn' : 'info') as IncidentAiSeverity,
      source: 'prometheus',
    })),
  ]

  if (metrics.runtime) {
    logLines.push({
      time: metrics.lastUpdated,
      text: `Node runtime event loop p99 ${Math.round(metrics.runtime.eventLoopP99Ms)}ms, handles ${Math.round(metrics.runtime.activeHandles)}`,
      severity: metrics.runtime.eventLoopP99Ms >= 200 ? 'warn' : 'info',
      source: 'prometheus',
    })
  }

  if (dash.albMetrics?.current) {
    logLines.push({
      time: lastUpdated,
      text: `ALB response ${Math.round(dash.albMetrics.current.response_time_ms || 0)}ms, healthy ${dash.albMetrics.current.healthy_hosts}, unhealthy ${dash.albMetrics.current.unhealthy_hosts}, 5xx ${dash.albMetrics.current.http_5xx_last_bucket || 0}`,
      severity:
        (dash.albMetrics.current.unhealthy_hosts || 0) > 0 || (dash.albMetrics.current.http_5xx_last_bucket || 0) > 0
          ? 'error'
          : 'info',
      source: 'cloudwatch',
    })
  }

  if (dash.rdsMetrics?.current) {
    logLines.push({
      time: lastUpdated,
      text: `RDS CPU ${dash.rdsMetrics.current.cpu_percent}%, connections ${dash.rdsMetrics.current.connections}, read latency ${dash.rdsMetrics.current.read_latency_ms}ms, write latency ${dash.rdsMetrics.current.write_latency_ms}ms`,
      severity: dash.rdsMetrics.current.cpu_percent >= 80 ? 'warn' : 'info',
      source: 'cloudwatch',
    })
  }

  return {
    page: 'gwanje',
    title: '관제 전체 로그 AI 분석',
    context: '관제 페이지 전체 로그와 성능 지표를 함께 요약한다. 현재 탭과 무관하게 페이지 전체 데이터를 기준으로 본다.',
    lastUpdated,
    summaryCards: [...normalizeCards(infraCards), ...normalizeCards(awsCards)].slice(0, 16),
    logLines: logLines.slice(0, 80),
  }
}

/** 관제 — 인프라 / AWS 리소스 탭 */
export default function IncidentGwanjePage() {
  const [scope, setScope] = useState<InfraAwsScope>('infra')
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<IncidentAiAnalysisResponse | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const dash = useDashboardData()
  const metrics = useMetrics()
  const infra = useGwanjeInfraCards(dash, metrics)
  const awsResource = useGwanjeAwsResourceCards(dash, metrics)

  const headerLoading = dash.loading || metrics.loading
  const lastUpdatedStr = useMemo(() => {
    if (headerLoading) return '불러오는 중…'
    if (dash.lastUpdated) return dash.lastUpdated.toLocaleTimeString('ko-KR')
    return metrics.lastUpdated !== '-' ? metrics.lastUpdated : '—'
  }, [headerLoading, dash.lastUpdated, metrics.lastUpdated])

  const requestAnalysis = useCallback(async () => {
    return requestIncidentAiAnalysis(
      buildGwanjeAnalysisRequest(dash, metrics, infra.cards, awsResource.cards, lastUpdatedStr),
    )
  }, [awsResource.cards, dash, infra.cards, lastUpdatedStr, metrics])

  const handleAnalyze = useCallback(async () => {
    setAnalysisOpen(true)
    setAnalysisLoading(true)
    setAnalysisError(null)

    try {
      const result = await requestAnalysis()
      setAnalysis(result)
    } catch (error) {
      setAnalysis(null)
      setAnalysisError(error instanceof Error ? error.message : 'AI 분석 요청에 실패했습니다.')
    } finally {
      setAnalysisLoading(false)
    }
  }, [requestAnalysis])

  const handleReport = useCallback(async () => {
    setReportLoading(true)

    try {
      const request = buildGwanjeAnalysisRequest(dash, metrics, infra.cards, awsResource.cards, lastUpdatedStr)
      const result = await requestAnalysis()
      setAnalysis(result)
      exportIncidentReport({ request, analysis: result })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '보고서 출력에 실패했습니다.')
    } finally {
      setReportLoading(false)
    }
  }, [awsResource.cards, dash, infra.cards, lastUpdatedStr, metrics, requestAnalysis])

  const cpuDetailRef = useRef<HTMLDivElement>(null)
  const memoryDetailRef = useRef<HTMLDivElement>(null)
  const diskIoDetailRef = useRef<HTMLDivElement>(null)
  const nodeRuntimeDetailRef = useRef<HTMLDivElement>(null)
  const albResponseDetailRef = useRef<HTMLDivElement>(null)
  const awsNetworkDetailRef = useRef<HTMLDivElement>(null)
  const awsRpsDetailRef = useRef<HTMLDivElement>(null)
  const awsHttpDetailRef = useRef<HTMLDivElement>(null)
  const awsConnDetailRef = useRef<HTMLDivElement>(null)

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
      if (
        section === 'haeAuth' ||
        section === 'haeAwsTrail' ||
        section === 'haeAwsVpcFlow' ||
        section === 'haeAwsWaf' ||
        section === 'haeAwsGuardDuty'
      )
        return
      const el =
        section === 'cpu'
          ? cpuDetailRef.current
          : section === 'memory'
            ? memoryDetailRef.current
            : section === 'disk'
              ? diskIoDetailRef.current
              : section === 'node'
                ? nodeRuntimeDetailRef.current
                : section === 'alb'
                  ? albResponseDetailRef.current
                  : section === 'awsNet'
                    ? awsNetworkDetailRef.current
                    : section === 'awsRps'
                      ? awsRpsDetailRef.current
                      : section === 'awsHttp'
                        ? awsHttpDetailRef.current
                        : section === 'awsConn'
                          ? awsConnDetailRef.current
                          : null
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [],
  )

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="관제"
        subtitle={
          scope === 'infra'
            ? 'CloudWatch·Prometheus에서 가져온 인프라 요약입니다.'
            : 'AWS 리소스(CloudWatch ALB·ECS 등) 요약입니다.'
        }
        lastUpdated={lastUpdatedStr}
        actions={
          <LogPageHeaderActions
            page="gwanje"
            onReport={() => void handleReport()}
            reportLoading={reportLoading}
            onAnalyze={() => void handleAnalyze()}
            analysisLoading={analysisLoading}
          />
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InfraAwsTabs value={scope} onChange={setScope} />
        <p className="text-[11px] text-gray-500">
          {scope === 'infra'
            ? 'ECS·RDS·ALB는 CloudWatch, 앱 런타임은 Prometheus입니다.'
            : '네트워크·RPS·HTTP코드·연결·비정상 타깃은 CloudWatch, ALB 오류 시 RPS는 Prometheus로 보완할 수 있습니다.'}
        </p>
      </div>
      {scope === 'infra' ? (
        <div className="space-y-8">
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">요약 지표</h3>
            <InfraDataSummaryCards
              cards={infra.cards}
              loading={infra.loading}
              error={infra.error}
              detailLinkByCardId={{
                'ecs-cpu': 'cpu',
                'ecs-mem': 'memory',
                'rds-io': 'disk',
                'rds-disk-free': 'disk',
                'node-io': 'node',
                'alb-latency': 'alb',
              }}
              onScrollToDetail={scrollToDetail}
            />
          </section>
          <section className="space-y-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">세부 지표</h3>
            <div ref={cpuDetailRef} id="gwanje-detail-cpu" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">CPU</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                ECS·RDS 각각의 CPUUtilization 시계열입니다. 두 값은 서로 다른 자원 기준(0~100%)이며 합산되지 않습니다.
              </p>
              <GwanjeCpuTrendCards ecs={dash.ecsMetrics} rds={dash.rdsMetrics} loading={dash.loading} />
            </div>
            <div ref={memoryDetailRef} id="gwanje-detail-memory" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">메모리</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                ECS는 MemoryUtilization(%), RDS는 FreeableMemory(가용 RAM, MB)입니다. 의미가 서로 다르며 합산하지 않습니다.
              </p>
              <GwanjeMemoryTrendCards ecs={dash.ecsMetrics} rds={dash.rdsMetrics} loading={dash.loading} />
            </div>
            <div ref={diskIoDetailRef} id="gwanje-detail-disk-io" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">디스크 I/O</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                왼쪽은 읽기·쓰기 <strong className="font-medium text-gray-600">평균 지연(ms)</strong>(IOPS와는 다른 지표),
                오른쪽은 프로비저닝된 전체 용량 대비 <strong className="font-medium text-gray-600">남은 공간</strong>(도넛)입니다.
              </p>
              <GwanjeDiskIoTrendCards rds={dash.rdsMetrics} loading={dash.loading} />
            </div>
            <div ref={albResponseDetailRef} id="gwanje-detail-alb-latency" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">ALB 응답 시간</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                <strong className="font-medium text-gray-600">TargetResponseTime</strong> 평균(ms) 시계열입니다. 브라우저·CloudFront
                구간은 포함되지 않으며, ALB와 타깃(ECS 등) 사이 지연에 가깝습니다.
              </p>
              <GwanjeAlbResponseTimeCard alb={dash.albMetrics} loading={dash.loading} />
            </div>
            <div ref={nodeRuntimeDetailRef} id="gwanje-detail-node-http" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Node · HTTP</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                왼쪽은 <strong className="font-medium text-gray-600">엔드포인트별 RPS·지연·에러</strong>, 오른쪽은 요약과 같은{' '}
                <strong className="font-medium text-gray-600">활성 핸들·대기 요청</strong> 수의 추이입니다. 핸들/요청 개별 이름은
                보안상 표시하지 않습니다.
              </p>
              <GwanjeNodeRuntimeDetailCards metrics={metrics} />
            </div>
            <div id="gwanje-detail-prometheus-http-security" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Prometheus · HTTP 트래픽 보안 현황
              </h4>
              <p className="text-[11px] text-gray-500 mb-3">
                관측 로그(애플리케이션)와 동일한{' '}
                <strong className="font-medium text-gray-600">http_requests_total</strong> 기반 요약·추이·라우트별 레이턴시입니다.
              </p>
              <LogsMetricsErrorBoundary>
                <PrometheusHttpCard metrics={metrics} />
              </LogsMetricsErrorBoundary>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">요약 지표</h3>
            <InfraDataSummaryCards
              cards={awsResource.cards}
              loading={awsResource.loading}
              error={awsResource.error}
              detailLinkByCardId={{
                'aws-ecs-net-in': 'awsNet',
                'aws-ecs-net-out': 'awsNet',
                'aws-rps': 'awsRps',
                'aws-rps-fallback': 'awsRps',
                'aws-http-codes': 'awsHttp',
                'aws-alb-conn': 'awsConn',
                'aws-unhealthy': 'awsConn',
              }}
              onScrollToDetail={scrollToDetail}
            />
          </section>
          <section className="space-y-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">세부 지표</h3>
            <div ref={awsNetworkDetailRef} id="gwanje-detail-aws-network" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">네트워크 I/O</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                왼쪽은 ECS 서비스 기준 <strong className="font-medium text-gray-600">수신·송신</strong>, 오른쪽은 ALB{' '}
                <strong className="font-medium text-gray-600">ProcessedBytes</strong>입니다. 단위는 MB/s(버킷 합을 초로 나눈
                뒤 MB)이며, 두 그래프는 지표 정의가 달라 합산하지 않습니다.
              </p>
              <GwanjeAwsNetworkDetailCards alb={dash.albMetrics} loading={dash.loading} />
            </div>
            <div ref={awsRpsDetailRef} id="gwanje-detail-aws-rps" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">요청 RPS</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                왼쪽은 ALB <strong className="font-medium text-gray-600">RequestCount</strong>로 구한 RPS 추이, 오른쪽은
                Prometheus <strong className="font-medium text-gray-600">http_requests_total</strong> 기반 라우트별
                추정 RPS입니다. 측정 위치가 달라 수치를 직접 합산하지 않습니다.
              </p>
              <GwanjeAwsRpsDetailCards alb={dash.albMetrics} metrics={metrics} loading={dash.loading || metrics.loading} />
            </div>
            <div ref={awsHttpDetailRef} id="gwanje-detail-aws-http" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">HTTP 상태</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                왼쪽은 ALB <strong className="font-medium text-gray-600">HTTPCode_Target_*</strong> 2xx·4xx·5xx 버킷 합 시계열,
                오른쪽은 Prometheus <strong className="font-medium text-gray-600">http_requests_total</strong> 기준 라우트별
                4xx·5xx 누적입니다. ALB는 L7 타깃 응답, 앱 라우트는 프로세스 내부 집계라 정의가 다릅니다.
              </p>
              <GwanjeAwsHttpDetailCards alb={dash.albMetrics} metrics={metrics} loading={dash.loading || metrics.loading} />
            </div>
            <div ref={awsConnDetailRef} id="gwanje-detail-aws-conn-health" className="scroll-mt-4">
              <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">연결·타깃 헬스</h4>
              <p className="text-[11px] text-gray-500 mb-3">
                동시 연결은 <strong className="font-medium text-gray-600">ActiveConnectionCount</strong> 평균, 신규·거절은
                버킷 합입니다. 정상·비정상 대수는 <strong className="font-medium text-gray-600">Healthy/UnHealthyHostCount</strong>{' '}
                평균 시계열이며, 아래 표는 타깃 그룹별 등록 인스턴스 대비 정상 수입니다.
              </p>
              <GwanjeAwsConnectionHealthDetailCards alb={dash.albMetrics} loading={dash.loading} />
            </div>
          </section>
        </div>
      )}
      <IncidentAiSummaryDialog
        open={analysisOpen}
        loading={analysisLoading}
        error={analysisError}
        analysis={analysis}
        onClose={() => setAnalysisOpen(false)}
      />
    </div>
  )
}
