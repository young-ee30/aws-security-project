import { cn } from '@/lib/utils'
import type { TelemetrySource } from '@/data/monitoringIncidentMock'

const LABEL: Record<TelemetrySource, string> = {
  cloudwatch: 'CloudWatch',
  prometheus: 'Prometheus',
  cloudtrail: 'CloudTrail',
}

const STYLE: Record<TelemetrySource, string> = {
  cloudwatch: 'bg-orange-50 text-orange-800 border-orange-200',
  prometheus: 'bg-sky-50 text-sky-800 border-sky-200',
  cloudtrail: 'bg-violet-50 text-violet-800 border-violet-200',
}

interface SourceBadgeProps {
  source: TelemetrySource
  className?: string
}

/** 로그/메트릭이 어느 수집 소스에서 온 것인지 표시 (더미·실연동 공통) */
export default function SourceBadge({ source, className }: SourceBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border tabular-nums',
        STYLE[source],
        className,
      )}
      title={`데이터 소스: ${LABEL[source]}`}
    >
      {LABEL[source]}
    </span>
  )
}
