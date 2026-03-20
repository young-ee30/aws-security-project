import { cn } from '@/lib/utils'
import { CheckCircle2, Circle, Clock, SkipForward, XCircle } from 'lucide-react'

interface PipelineJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  steps?: Array<{
    name: string
    status: string
    conclusion: string | null
  }>
}

interface PipelineDisplayJob extends PipelineJob {
  key: string
  displayName: string
  description: string
  isPlaceholder?: boolean
}

interface PipelineGraphProps {
  workflowName: string | null
  jobs: PipelineJob[]
  activeJobId: number | null
  onJobClick: (jobId: number) => void
}

interface JobGroup {
  jobs: PipelineDisplayJob[]
}

function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return ''
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return ''
  const totalSeconds = Math.floor((end - start) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function getJobStatusIcon(status: string, conclusion: string | null) {
  if (status === 'pending') {
    return <Circle className="h-4 w-4 text-gray-300" />
  }
  if (status !== 'completed') {
    return <Clock className="h-4 w-4 animate-pulse text-blue-500" />
  }
  if (conclusion === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />
  }
  if (conclusion === 'failure') {
    return <XCircle className="h-4 w-4 text-red-500" />
  }
  if (conclusion === 'skipped') {
    return <SkipForward className="h-4 w-4 text-gray-400" />
  }
  if (conclusion === 'cancelled') {
    return <Circle className="h-4 w-4 text-gray-400" />
  }
  return <Circle className="h-4 w-4 text-gray-400" />
}

function getJobBorderColor(status: string, conclusion: string | null, isActive: boolean, isPlaceholder: boolean): string {
  if (isActive) return 'border-indigo-400 shadow-md shadow-indigo-100'
  if (isPlaceholder || status === 'pending') return 'border-gray-200'
  if (status !== 'completed') return 'border-blue-300'
  if (conclusion === 'success') return 'border-green-300'
  if (conclusion === 'failure') return 'border-red-300'
  return 'border-gray-200'
}

function getJobBgColor(status: string, conclusion: string | null, isActive: boolean, isPlaceholder: boolean): string {
  if (isActive) return 'bg-indigo-50'
  if (isPlaceholder || status === 'pending') return 'bg-gray-50'
  if (status !== 'completed') return 'bg-blue-50/50'
  if (conclusion === 'success') return 'bg-green-50/50'
  if (conclusion === 'failure') return 'bg-red-50/50'
  return 'bg-gray-50'
}

function getConnectorColor(prevConclusion: string | null, prevStatus: string, isPlaceholder: boolean): string {
  if (isPlaceholder || prevStatus === 'pending') return 'bg-gray-300'
  if (prevStatus !== 'completed') return 'bg-blue-300'
  if (prevConclusion === 'success') return 'bg-green-300'
  if (prevConclusion === 'failure') return 'bg-red-300'
  return 'bg-gray-300'
}

function createPlaceholderJob(key: string, name: string): PipelineDisplayJob {
  return {
    key,
    id: -1,
    name,
    displayName: name,
    description: getPipelineJobDescription(name),
    status: 'pending',
    conclusion: null,
    startedAt: null,
    completedAt: null,
    isPlaceholder: true,
  }
}

function hasNoDeployExplanation(job: PipelineJob): boolean {
  return job.steps?.some((step) => /explain current deployment state/i.test(step.name)) ?? false
}

function normalizePipelineJobName(job: PipelineJob): string {
  if (hasNoDeployExplanation(job) || /__noop__|already deployed|services already running/i.test(job.name)) {
    return 'Current deployment state'
  }

  if (/\$\{\{\s*matrix\.(service|job_name)\s*\}\}/i.test(job.name) || /deploy selected service/i.test(job.name)) {
    return 'Deploy selected service'
  }

  const deployMatch = job.name.match(/^deploy\s+(.+)$/i)
  if (deployMatch) {
    const serviceName = deployMatch[1].trim()
    return serviceName ? `Deploy ${serviceName}` : 'Deploy selected service'
  }

  return job.name
}

function getPipelineJobDescription(name: string, job?: PipelineJob): string {
  if ((job && hasNoDeployExplanation(job)) || /current deployment state|__noop__|already deployed|services already running/i.test(name)) {
    return '현재 배포 유지'
  }

  if (/create or reuse terraform state bucket/i.test(name)) {
    return 'state 파일 저장용 s3 버킷 확인'
  }

  if (/terraform plan & security scan/i.test(name)) {
    return '인프라 변경 계획'
  }

  if (/^terraform apply$/i.test(name)) {
    return '인프라 변경 적용'
  }

  if (/resolve deployment targets/i.test(name)) {
    return '배포 대상 확인'
  }

  if (/deploy/i.test(name)) {
    return 'ECS 배포'
  }

  return '세부 정보 확인'
}

function toDisplayJob(job: PipelineJob): PipelineDisplayJob {
  return {
    ...job,
    key: `job-${job.id}`,
    displayName: normalizePipelineJobName(job),
    description: getPipelineJobDescription(normalizePipelineJobName(job), job),
  }
}

function findJob(jobs: PipelineJob[], pattern: RegExp): PipelineDisplayJob | null {
  const matched = jobs.find((job) => pattern.test(job.name))
  return matched ? toDisplayJob(matched) : null
}

function isDeployworkflowJob(job: PipelineJob): boolean {
  return (
    /^deploy\b/i.test(job.name) ||
    /\$\{\{\s*matrix\.(service|job_name)\s*\}\}/i.test(job.name) ||
    /deploy selected service|__noop__|already deployed|services already running/i.test(job.name) ||
    (job.steps?.some((step) => /explain current deployment state/i.test(step.name)) ?? false)
  )
}

function getworkflowGraphGroups(workflowName: string | null, jobs: PipelineJob[]): JobGroup[] {
  if (!workflowName) {
    return []
  }

  if (/bootstrap terraform state/i.test(workflowName)) {
    return [
      {
        jobs: [findJob(jobs, /create or reuse terraform state bucket/i) || createPlaceholderJob('bootstrap', 'Create or Reuse Terraform State Bucket')],
      },
    ]
  }

  if (/terraform dev plan and apply/i.test(workflowName)) {
    return [
      {
        jobs: [findJob(jobs, /terraform plan & security scan/i) || createPlaceholderJob('terraform-plan', 'Terraform Plan & Security Scan')],
      },
      {
        jobs: [findJob(jobs, /^terraform apply$/i) || createPlaceholderJob('terraform-apply', 'Terraform Apply')],
      },
    ]
  }

  if (/deploy selected services to ecs/i.test(workflowName)) {
    const resolveTargets =
      findJob(jobs, /resolve deployment targets/i) || createPlaceholderJob('resolve-targets', 'Resolve Deployment Targets')
    const deployJobs = jobs.filter(isDeployworkflowJob).map(toDisplayJob)

    return [
      { jobs: [resolveTargets] },
      {
        jobs: deployJobs.length > 0 ? deployJobs : [createPlaceholderJob('deploy-selected', 'Deploy selected service')],
      },
    ]
  }

  if (jobs.length > 0) {
    return groupJobsByExecution(jobs)
  }

  return []
}

export default function PipelineGraph({ workflowName, jobs, activeJobId, onJobClick }: PipelineGraphProps) {
  const groups = getworkflowGraphGroups(workflowName, jobs)

  if (!workflowName) {
    return null
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-700">PIPELINE</p>
        <p className="text-sm text-gray-500">선택한 workflow의 pipeline 정보를 아직 불러오지 못했습니다.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-4 00">PIPELINE</p>
        <p className="mt-1 text-sm text-gray-600">{workflowName}</p>
      </div>

      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {groups.map((group, groupIndex) => (
          <div key={`group-${groupIndex}`} className="flex items-center gap-0">
            {groupIndex > 0 && (
              <div className="flex items-center px-1">
                <div
                  className={cn(
                    'h-0.5 w-8 rounded-full',
                    getConnectorColor(
                      groups[groupIndex - 1].jobs[0].conclusion,
                      groups[groupIndex - 1].jobs[0].status,
                      !!groups[groupIndex - 1].jobs[0].isPlaceholder,
                    ),
                  )}
                />
                <div className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-gray-300" />
              </div>
            )}

            <div className={cn('flex', group.jobs.length > 1 ? 'flex-col gap-2' : '')}>
              {group.jobs.map((job) => {
                const isPlaceholder = !!job.isPlaceholder
                const isActive = !isPlaceholder && activeJobId === job.id
                const duration = formatDuration(job.startedAt, job.completedAt)
                const isClickable = !isPlaceholder && job.id > 0

                return (
                  <button
                    key={job.key}
                    type="button"
                    disabled={!isClickable}
                    onClick={() => {
                      if (isClickable) {
                        onJobClick(job.id)
                      }
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-left transition-all',
                      isClickable ? 'hover:shadow-md' : 'cursor-default',
                      getJobBorderColor(job.status, job.conclusion, isActive, isPlaceholder),
                      getJobBgColor(job.status, job.conclusion, isActive, isPlaceholder),
                    )}
                  >
                    {getJobStatusIcon(job.status, job.conclusion)}
                    <div className="min-w-0">
                      <span className={cn('block text-sm font-medium leading-tight', isPlaceholder ? 'text-gray-500' : 'text-gray-800')}>
                        {job.displayName}
                      </span>
                      <span className="mt-1 block text-xs leading-4 text-gray-400">{job.description}</span>
                    </div>
                    {duration && <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">{duration}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function groupJobsByExecution(jobs: PipelineJob[]): JobGroup[] {
  if (jobs.length === 0) return []

  const sorted = [...jobs].sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0
    if (!a.startedAt) return 1
    if (!b.startedAt) return -1
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  })

  const groups: JobGroup[] = []
  let currentGroup: PipelineJob[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = currentGroup[0]
    const curr = sorted[i]

    if (prev.startedAt && curr.startedAt) {
      const timeDiff = Math.abs(new Date(curr.startedAt).getTime() - new Date(prev.startedAt).getTime())
      if (timeDiff < 5000) {
        currentGroup.push(curr)
        continue
      }
    }

    groups.push({ jobs: currentGroup.map(toDisplayJob) })
    currentGroup = [curr]
  }

  groups.push({ jobs: currentGroup.map(toDisplayJob) })
  return groups
}
