import { cn } from '@/lib/utils'

export type InfraAwsScope = 'infra' | 'aws'

type Props = {
  value: InfraAwsScope
  onChange: (v: InfraAwsScope) => void
  className?: string
  /** 기본: 인프라 데이터 */
  infraLabel?: string
  /** 기본: AWS 리소스 */
  awsLabel?: string
}

/** 관제 / 침해: 인프라 데이터 vs AWS 리소스 (라벨은 페이지별로 오버라이드 가능) */
export default function InfraAwsTabs({ value, onChange, className, infraLabel, awsLabel }: Props) {
  const infra = infraLabel ?? '인프라 데이터'
  const aws = awsLabel ?? 'AWS 리소스'
  return (
    <div
      className={cn(
        'inline-flex flex-wrap gap-1 p-1 rounded-xl bg-gray-100/90 border border-gray-200 shadow-sm',
        className,
      )}
      role="tablist"
      aria-label="데이터 범위"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'infra'}
        className={cn(
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          value === 'infra'
            ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50/80',
        )}
        onClick={() => onChange('infra')}
      >
        {infra}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'aws'}
        className={cn(
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          value === 'aws'
            ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50/80',
        )}
        onClick={() => onChange('aws')}
      >
        {aws}
      </button>
    </div>
  )
}

/** 탭별 빈 영역 (추후 위젯 교체) */
export function InfraAwsScopePanel({ scope }: { scope: InfraAwsScope }) {
  const title = scope === 'infra' ? '인프라 데이터' : 'AWS 리소스'
  return (
    <section className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="text-xs text-gray-500 mt-2">이 영역에 콘텐츠를 연결하면 됩니다.</p>
    </section>
  )
}
