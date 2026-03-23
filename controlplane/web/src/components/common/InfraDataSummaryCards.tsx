import SourceBadge from '@/components/common/SourceBadge'
import type { GwanjeInfraCard } from '@/hooks/useGwanjeInfraCards'

type Props = {
  cards: GwanjeInfraCard[]
  loading: boolean
  error: string | null
  /** 카드 id → 세부 지표 영역(스크롤 이동). `onScrollToDetail`과 함께 사용 */
  detailLinkByCardId?: Partial<
    Record<
      string,
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
      | 'haeAwsGuardDuty'
    >
  >
  onScrollToDetail?: (
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
  ) => void
}

export default function InfraDataSummaryCards({
  cards,
  loading,
  error,
  detailLinkByCardId,
  onScrollToDetail,
}: Props) {
  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          일부 소스 오류: {error}
        </p>
      )}
      {loading && cards.length === 0 ? (
        <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
      ) : cards.length === 0 ? (
        <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
          표시할 메트릭이 없습니다. 대시보드 API( localhost:4000 )와 AWS·Prometheus 연결을 확인하세요.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {cards.map((c) => {
            const link = detailLinkByCardId?.[c.id]
            const clickable = Boolean(link && onScrollToDetail)
            const cardClass =
              'rounded-xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col gap-1.5 min-h-[88px]' +
              (clickable
                ? ' cursor-pointer hover:bg-gray-50 text-left w-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2'
                : '')
            const label =
              link === 'cpu'
                ? '세부 지표 CPU 영역으로 이동'
                : link === 'memory'
                  ? '세부 지표 메모리 영역으로 이동'
                  : link === 'disk'
                    ? '세부 지표 디스크 I/O 영역으로 이동'
                    : link === 'node'
                      ? '세부 지표 Node·HTTP 영역으로 이동'
                      : link === 'alb'
                        ? '세부 지표 ALB 응답 시간 영역으로 이동'
                        : link === 'awsNet'
                          ? '세부 지표 네트워크 I/O 영역으로 이동'
                          : link === 'awsRps'
                          ? '세부 지표 요청 RPS 영역으로 이동'
                          : link === 'awsHttp'
                            ? '세부 지표 HTTP 상태 영역으로 이동'
                            : link === 'awsConn'
                              ? '세부 지표 연결·타깃 헬스 영역으로 이동'
                              : link === 'haeAuth'
                                ? '세부 지표 인증·권한 로그 영역으로 이동'
                                : link === 'haeAwsTrail'
                                  ? '세부 지표 AWS CloudTrail 영역으로 이동'
                                  : link === 'haeAwsVpcFlow'
                                    ? '세부 지표 VPC Flow Logs 영역으로 이동'
                                    : link === 'haeAwsWaf'
                                      ? '세부 지표 AWS WAF 영역으로 이동'
                                      : link === 'haeAwsGuardDuty'
                                        ? '세부 지표 GuardDuty 영역으로 이동'
                                        : undefined
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-gray-500 leading-snug">{c.title}</p>
                  <SourceBadge source={c.source} />
                </div>
                <p className="text-lg font-semibold text-gray-900 tabular-nums leading-tight">{c.value}</p>
                {c.sub && <p className="text-[10px] text-gray-400 leading-snug">{c.sub}</p>}
              </>
            )
            return clickable ? (
              <button
                key={c.id}
                type="button"
                className={cardClass}
                aria-label={label}
                onClick={() => onScrollToDetail!(link!)}
              >
                {body}
              </button>
            ) : (
              <div key={c.id} className={cardClass}>
                {body}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
