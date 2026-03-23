import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Clock, SkipForward, Circle } from 'lucide-react'

interface StepInfo {
  name: string
  number: number
  status: string
  conclusion: string | null
  failureTone?: 'security' | 'warning' | null
  summary?: string
  durationSeconds?: number | null
  startedAt?: string | null
  completedAt?: string | null
}

interface StepTimelineProps {
  steps: StepInfo[]
  activeStepNumber?: number | null
  onStepClick?: (step: StepInfo) => void
  stepDomIdPrefix?: string
  renderExpandedContent?: (step: StepInfo) => ReactNode
}

function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function getFailureTone(step: StepInfo): 'security' | 'warning' {
  if (step.failureTone) {
    return step.failureTone
  }

  return /gitleaks|trivy|checkov/i.test(step.name) ? 'security' : 'warning'
}

function getHoverHighlight(step: StepInfo): string {
  if (step.status !== 'completed') {
    return 'hover:border-blue-200 hover:bg-blue-50/70'
  }

  if (step.conclusion === 'failure') {
    return getFailureTone(step) === 'security'
      ? 'hover:border-red-200 hover:bg-red-50/80'
      : 'hover:border-amber-200 hover:bg-amber-50/80'
  }

  return 'hover:border-indigo-200 hover:bg-indigo-50/60'
}

function getStepIcon(step: StepInfo) {
  const base = 'h-4 w-4 shrink-0'
  if (step.status !== 'completed') {
    return <Clock className={cn(base, 'text-blue-500 animate-pulse')} />
  }
  if (step.conclusion === 'success') {
    return <CheckCircle2 className={cn(base, 'text-green-500')} />
  }
  if (step.conclusion === 'failure') {
    return (
      <XCircle
        className={cn(
          base,
          getFailureTone(step) === 'security' ? 'text-red-500' : 'text-amber-500',
        )}
      />
    )
  }
  if (step.conclusion === 'skipped') {
    return <SkipForward className={cn(base, 'text-gray-400')} />
  }
  return <Circle className={cn(base, 'text-gray-400')} />
}

function getLineColor(step: StepInfo): string {
  if (step.status !== 'completed') return 'bg-blue-300'
  if (step.conclusion === 'success') return 'bg-green-300'
  if (step.conclusion === 'failure') return getFailureTone(step) === 'security' ? 'bg-red-300' : 'bg-amber-300'
  return 'bg-gray-200'
}

function getStepHighlight(step: StepInfo): string {
  if (step.status !== 'completed') return 'bg-blue-50 border-blue-200'
  if (step.conclusion === 'failure') {
    return getFailureTone(step) === 'security' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
  }
  return 'bg-white border-gray-100'
}

function getActiveStepHighlight(step: StepInfo): string {
  if (step.status !== 'completed') return 'border-blue-300 bg-blue-50 ring-1 ring-blue-100'
  if (step.conclusion === 'failure') {
    return getFailureTone(step) === 'security'
      ? 'border-red-300 bg-red-50 ring-1 ring-red-100'
      : 'border-amber-300 bg-amber-50 ring-1 ring-amber-100'
  }
  return 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-100'
}

export default function StepTimeline({
  steps,
  activeStepNumber,
  onStepClick,
  stepDomIdPrefix,
  renderExpandedContent,
}: StepTimelineProps) {
  if (steps.length === 0) return null

  return (
    <div className="px-4 py-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        단계별 진행
      </p>
      <div className="relative">
        {steps.map((step, index) => {
          const duration = step.durationSeconds != null
            ? formatSeconds(step.durationSeconds)
            : step.startedAt
              ? formatSeconds(computeDuration(step.startedAt, step.completedAt))
              : ''
          const active = activeStepNumber === step.number
          const expandedContent = active ? renderExpandedContent?.(step) : null
          const cardClass = cn(
            'flex-1 rounded-lg border px-3 py-2 text-left transition-colors',
            getStepHighlight(step),
            onStepClick && 'cursor-pointer',
            onStepClick && getHoverHighlight(step),
            active && getActiveStepHighlight(step),
          )
          const cardId = stepDomIdPrefix ? `${stepDomIdPrefix}-${step.number}` : undefined
          const content = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    step.conclusion === 'failure'
                      ? getFailureTone(step) === 'security'
                        ? 'text-red-700'
                        : 'text-amber-700'
                      : 'text-gray-800',
                  )}
                >
                  {step.name}
                </span>
                {duration && (
                  <span className="shrink-0 text-xs text-gray-400">{duration}</span>
                )}
              </div>
              {step.summary && (
                <p
                  className={cn(
                    'mt-1 text-xs leading-relaxed',
                    step.conclusion === 'failure'
                      ? getFailureTone(step) === 'security'
                        ? 'text-red-600'
                        : 'text-amber-700'
                      : 'text-gray-500',
                  )}
                >
                  {step.summary}
                </p>
              )}
            </>
          )

          return (
            <div key={`step-${step.number}`} className="mb-2">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 items-center">
                    {getStepIcon(step)}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn('w-0.5 flex-1 min-h-[16px]', getLineColor(step))}
                    />
                  )}
                </div>

                {onStepClick ? (
                  <button id={cardId} type="button" className={cardClass} onClick={() => onStepClick(step)}>
                    {content}
                  </button>
                ) : (
                  <div id={cardId} className={cardClass}>
                    {content}
                  </div>
                )}
              </div>

              {expandedContent ? (
                <div className="mt-2 flex gap-3">
                  <div className="w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    {expandedContent}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function computeDuration(startedAt: string | null | undefined, completedAt: string | null | undefined): number | null {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.floor((end - start) / 1000)
}
