import { getWorkflowRunJobs, getWorkflowRunLogs } from '../github/actions.js'

type WorkflowJob = Awaited<ReturnType<typeof getWorkflowRunJobs>>[number]
type WorkflowStep = WorkflowJob['steps'][number]

interface StepSummary {
  name: string
  number: number
  status: string
  conclusion: string | null
  summary: string
  durationSeconds: number | null
}

interface JobSummary {
  jobId: number
  name: string
  status: string
  conclusion: string | null
  summary: string
  durationSeconds: number | null
  steps: StepSummary[]
}

export interface RunSummaryResponse {
  runId: number
  jobs: JobSummary[]
  overallSummary: string
  currentPhase: string | null
}

function computeDuration(startedAt: string | null | undefined, completedAt: string | null | undefined): number | null {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.floor((end - start) / 1000)
}

const STEP_PATTERNS: Array<{ test: (name: string) => boolean; summary: string }> = [
  { test: (n) => /checkout\s*code/i.test(n), summary: '소스 코드를 체크아웃하는 단계' },
  { test: (n) => /configure\s*aws/i.test(n), summary: 'AWS 자격증명을 설정하는 단계' },
  { test: (n) => /setup\s*terraform/i.test(n), summary: 'Terraform CLI를 설치하는 단계' },
  { test: (n) => /resolve\s*state\s*bucket/i.test(n), summary: 'Terraform state 버킷을 확인하는 단계' },
  { test: (n) => /check\s*terraform\s*secrets/i.test(n), summary: '필수 시크릿 값이 설정됐는지 확인하는 단계' },
  { test: (n) => /create\s*backend/i.test(n), summary: 'Terraform 백엔드 설정 파일을 생성하는 단계' },
  { test: (n) => /terraform\s*format/i.test(n), summary: 'Terraform 코드 포맷을 검사하는 단계' },
  { test: (n) => /terraform\s*init/i.test(n), summary: 'Terraform 프로바이더와 모듈을 초기화하는 단계' },
  { test: (n) => /terraform\s*validate/i.test(n), summary: 'Terraform 구성의 문법을 검증하는 단계' },
  { test: (n) => /checkov/i.test(n), summary: 'IaC 보안 스캔으로 취약점을 검사하는 단계' },
  { test: (n) => /terraform\s*plan/i.test(n), summary: '인프라 변경사항을 미리 확인하는 단계' },
  { test: (n) => /terraform\s*apply/i.test(n), summary: '인프라 변경을 실제로 적용하는 단계' },
  { test: (n) => /import\s*orphan.*iam/i.test(n), summary: '기존 IAM 리소스를 Terraform state로 가져오는 단계' },
  { test: (n) => /import\s*orphan.*log/i.test(n), summary: '기존 CloudWatch 로그 그룹을 state로 가져오는 단계' },
  { test: (n) => /import\s*orphan.*target/i.test(n), summary: '기존 ALB 타겟 그룹을 state로 가져오는 단계' },
  { test: (n) => /clean\s*orphan.*efs/i.test(n), summary: '사용되지 않는 EFS 파일시스템을 정리하는 단계' },
  { test: (n) => /resolve.*commit/i.test(n), summary: '배포할 커밋 SHA를 결정하는 단계' },
  { test: (n) => /resolve.*active.*backend/i.test(n), summary: '활성 백엔드 서비스를 확인하는 단계' },
  { test: (n) => /build.*service.*matrix/i.test(n), summary: '배포 대상 서비스 목록을 생성하는 단계' },
  { test: (n) => /explain.*current.*deployment.*state/i.test(n), summary: '이미 배포된 서비스를 그대로 유지하는 단계' },
  { test: (n) => /resolve.*service.*config/i.test(n), summary: '서비스별 ECS/ECR 설정을 결정하는 단계' },
  { test: (n) => /deploy.*service/i.test(n), summary: '서비스를 ECS에 배포하는 단계' },
  { test: (n) => /docker.*build|build.*image/i.test(n), summary: 'Docker 이미지를 빌드하는 단계' },
  { test: (n) => /push.*image|ecr.*push/i.test(n), summary: 'Docker 이미지를 ECR에 푸시하는 단계' },
  { test: (n) => /login.*ecr/i.test(n), summary: 'ECR 레지스트리에 로그인하는 단계' },
  { test: (n) => /trivy|scan.*image|security.*scan/i.test(n), summary: '컨테이너 이미지 보안 스캔 단계' },
  { test: (n) => /checkout/i.test(n), summary: '소스 코드를 체크아웃하는 단계' },
  { test: (n) => /set\s*up|setup/i.test(n), summary: '도구 및 환경을 설정하는 단계' },
  { test: (n) => /post\s/i.test(n), summary: '후처리 정리 단계' },
  { test: (n) => /complete\s*job/i.test(n), summary: 'Job 완료 정리 단계' },
]

function summarizeStep(step: WorkflowStep): string {
  for (const pattern of STEP_PATTERNS) {
    if (pattern.test(step.name)) {
      const statusLabel = getStepStatusLabel(step.status, step.conclusion)
      return `${statusLabel} ${pattern.summary}`
    }
  }
  return getStepStatusLabel(step.status, step.conclusion) + ' ' + step.name
}

function getStepStatusLabel(status: string, conclusion: string | null): string {
  if (status !== 'completed') return '⏳ 진행중:'
  if (conclusion === 'success') return '✅ 완료:'
  if (conclusion === 'skipped') return '⏭️ 건너뜀:'
  if (conclusion === 'failure') return '❌ 실패:'
  return '⚠️ 종료:'
}

function summarizeJob(job: WorkflowJob): string {
  const totalSteps = job.steps.length
  const completedSteps = job.steps.filter((s) => s.status === 'completed').length
  const failedSteps = job.steps.filter((s) => s.conclusion === 'failure')

  if (/이미 배포된 서비스 유지|services already running/i.test(job.name)) {
    return '현재 서비스가 이미 배포되어 있어 추가 ECS 배포를 생략했습니다.'
  }

  if (job.status !== 'completed') {
    const activeStep = job.steps.find((s) => s.status === 'in_progress')
    if (activeStep) {
      return `${completedSteps}/${totalSteps} 단계 진행중 — 현재: ${activeStep.name}`
    }
    return `${completedSteps}/${totalSteps} 단계 진행중`
  }

  if (job.conclusion === 'success') {
    return `전체 ${totalSteps}단계 성공 완료`
  }

  if (failedSteps.length > 0) {
    return `${failedSteps.map((s) => s.name).join(', ')} 단계에서 실패`
  }

  return `${job.conclusion || 'unknown'} 상태로 완료`
}

function determineCurrentPhase(jobs: WorkflowJob[]): string | null {
  const inProgressJob = jobs.find((j) => j.status === 'in_progress')
  if (inProgressJob) {
    const activeStep = inProgressJob.steps.find((s) => s.status === 'in_progress')
    if (activeStep) {
      const matched = STEP_PATTERNS.find((p) => p.test(activeStep.name))
      return matched ? `${inProgressJob.name} — ${matched.summary}` : `${inProgressJob.name} — ${activeStep.name}`
    }
    return `${inProgressJob.name} 실행중`
  }

  const queuedJob = jobs.find((j) => j.status === 'queued')
  if (queuedJob) {
    return `${queuedJob.name} 대기중`
  }

  const allSuccess = jobs.every((j) => j.conclusion === 'success')
  if (allSuccess) return '모든 작업 완료 ✅'

  const failedJobs = jobs.filter((j) => j.conclusion === 'failure')
  if (failedJobs.length > 0) {
    return `${failedJobs.map((j) => j.name).join(', ')} 실패 ❌`
  }

  return '완료'
}

function buildOverallSummary(jobs: WorkflowJob[]): string {
  const totalJobs = jobs.length
  const successJobs = jobs.filter((j) => j.conclusion === 'success').length
  const failedJobs = jobs.filter((j) => j.conclusion === 'failure').length
  const runningJobs = jobs.filter((j) => j.status !== 'completed').length

  const parts: string[] = [`총 ${totalJobs}개 Job`]

  if (runningJobs > 0) parts.push(`${runningJobs}개 실행중`)
  if (successJobs > 0) parts.push(`${successJobs}개 성공`)
  if (failedJobs > 0) parts.push(`${failedJobs}개 실패`)

  return parts.join(' · ')
}

export async function generateRunSummary(runId: number): Promise<RunSummaryResponse> {
  const jobs = await getWorkflowRunJobs(runId)

  const jobSummaries: JobSummary[] = jobs.map((job) => ({
    jobId: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    summary: summarizeJob(job),
    durationSeconds: computeDuration(job.startedAt, job.completedAt),
    steps: job.steps.map((step) => ({
      name: step.name,
      number: step.number,
      status: step.status,
      conclusion: step.conclusion,
      summary: summarizeStep(step),
      durationSeconds: computeDuration(step.startedAt, step.completedAt),
    })),
  }))

  return {
    runId,
    jobs: jobSummaries,
    overallSummary: buildOverallSummary(jobs),
    currentPhase: determineCurrentPhase(jobs),
  }
}
