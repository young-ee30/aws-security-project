import { env } from '../config/env.js'
import { getInstallationToken, getRepoOctokit, getRepositoryMetadata } from './app.js'

type WorkflowDispatchInput = Record<string, string | number | boolean>

const FULL_PIPELINE_ENTRY_WORKFLOW = 'bootstrap-terraform-state.yml'
const FULL_PIPELINE_DEFAULT_INPUTS: WorkflowDispatchInput = {
  aws_region: 'ap-northeast-2',
  project_name: 'devsecops',
}

function formatConclusion(value: string | null | undefined): string {
  return value || 'unknown'
}

export async function listWorkflowRuns(limit = 20) {
  const octokit = await getRepoOctokit()
  const response = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    per_page: limit,
  })

  return response.data.workflow_runs.map((run) => ({
    id: run.id,
    workflowId: run.workflow_id,
    name: run.name,
    displayTitle: run.display_title,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    branch: run.head_branch,
    sha: run.head_sha,
    htmlUrl: run.html_url,
    runNumber: run.run_number,
    runAttempt: run.run_attempt,
    actor: run.actor?.login || null,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
  }))
}

export async function getWorkflowRunJobs(runId: number) {
  const octokit = await getRepoOctokit()
  const response = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    run_id: runId,
    per_page: 100,
  })

  return response.data.jobs.map((job) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    htmlUrl: job.html_url,
    runnerName: job.runner_name,
    labels: job.labels || [],
    steps: (job.steps || []).map((step) => ({
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      number: step.number,
      startedAt: step.started_at,
      completedAt: step.completed_at,
    })),
  }))
}

async function fetchJobLogText(jobId: number) {
  const token = await getInstallationToken()

  const redirectResponse = await fetch(
    `https://api.github.com/repos/${env.githubOwner}/${env.githubRepo}/actions/jobs/${jobId}/logs`,
    {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'controlplane-api',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )

  if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
    const location = redirectResponse.headers.get('location')
    if (!location) {
      throw new Error('GitHub did not return a log download URL')
    }

    const downloadResponse = await fetch(location, {
      headers: {
        'User-Agent': 'controlplane-api',
      },
    })

    if (!downloadResponse.ok) {
      throw new Error(`Failed to download job logs: HTTP ${downloadResponse.status}`)
    }

    return downloadResponse.text()
  }

  if (!redirectResponse.ok) {
    throw new Error(`Failed to resolve job logs: HTTP ${redirectResponse.status}`)
  }

  return redirectResponse.text()
}

export async function getWorkflowRunLogs(runId: number, requestedJobId?: number) {
  const jobs = await getWorkflowRunJobs(runId)

  const selectedJobs = requestedJobId
    ? jobs.filter((job) => job.id === requestedJobId)
    : jobs.filter(
      (job) =>
        job.status === 'completed' &&
        formatConclusion(job.conclusion) !== 'success' &&
        formatConclusion(job.conclusion) !== 'skipped',
    )

  const effectiveJobs =
    selectedJobs.length > 0
      ? selectedJobs
      : jobs.filter((job) => job.status === 'in_progress').slice(0, 3).length > 0
        ? jobs.filter((job) => job.status === 'in_progress').slice(0, 3)
        : jobs.slice(0, 3)

  const logs = await Promise.all(
    effectiveJobs.map(async (job) => {
      if (job.status !== 'completed') {
        return {
          jobId: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          content: `Logs are not available yet. Current job status: ${job.status}.`,
        }
      }

      try {
        return {
          jobId: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          content: await fetchJobLogText(job.id),
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        if (message.includes('HTTP 404')) {
          return {
            jobId: job.id,
            name: job.name,
            status: job.status,
            conclusion: job.conclusion,
            content: 'This job does not currently have a downloadable log archive from GitHub.',
          }
        }

        throw error
      }
    }),
  )

  return {
    runId,
    selectedJobIds: effectiveJobs.map((job) => job.id),
    logs,
  }
}

export async function rerunFailedJobs(runId: number) {
  const octokit = await getRepoOctokit()

  await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    run_id: runId,
  })

  return {
    ok: true,
    runId,
    message: 'Requested rerun for failed jobs',
  }
}

export async function rerunWorkflowRun(runId: number) {
  const octokit = await getRepoOctokit()

  await octokit.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    run_id: runId,
  })

  return {
    ok: true,
    runId,
    message: 'Requested rerun for entire workflow run',
  }
}

export async function dispatchWorkflow(workflowId: string, ref?: string, inputs?: WorkflowDispatchInput) {
  const octokit = await getRepoOctokit()
  const repository = await getRepositoryMetadata()
  const targetRef = ref || repository.default_branch

  const normalizedInputs = Object.fromEntries(
    Object.entries(inputs || {}).map(([key, value]) => [key, String(value)]),
  )

  await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    workflow_id: workflowId,
    ref: targetRef,
    inputs: normalizedInputs,
  })

  return {
    ok: true,
    workflowId,
    ref: targetRef,
  }
}

export async function dispatchFullPipeline(ref?: string) {
  const result = await dispatchWorkflow(FULL_PIPELINE_ENTRY_WORKFLOW, ref, FULL_PIPELINE_DEFAULT_INPUTS)

  return {
    ok: true,
    workflowId: result.workflowId,
    ref: result.ref,
    message: 'Requested full GitHub Actions pipeline from Bootstrap Terraform State',
  }
}

export async function getFileContent(filePath: string, ref?: string): Promise<string | null> {
  try {
    const octokit = await getRepoOctokit()
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: env.githubOwner,
      repo: env.githubRepo,
      path: filePath,
      ref: ref || undefined,
    })

    const data = response.data as { content?: string; encoding?: string }
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf8')
    }

    return null
  } catch {
    return null
  }
}

export async function getPullRequest(prNumber: number) {
  const octokit = await getRepoOctokit()

  const [pr, files] = await Promise.all([
    octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner: env.githubOwner,
      repo: env.githubRepo,
      pull_number: prNumber,
    }),
    octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: env.githubOwner,
      repo: env.githubRepo,
      pull_number: prNumber,
      per_page: 100,
    }),
  ])

  return {
    number: pr.data.number,
    title: pr.data.title,
    body: pr.data.body,
    state: pr.data.state,
    merged: pr.data.merged,
    htmlUrl: pr.data.html_url,
    headBranch: pr.data.head.ref,
    baseBranch: pr.data.base.ref,
    createdAt: pr.data.created_at,
    updatedAt: pr.data.updated_at,
    user: pr.data.user?.login || null,
    files: files.data.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch || null,
    })),
  }
}

export async function mergePullRequest(prNumber: number) {
  const octokit = await getRepoOctokit()
  const result = await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    pull_number: prNumber,
    merge_method: 'squash',
  })

  return {
    ok: true,
    merged: result.data.merged,
    sha: result.data.sha,
    message: result.data.message,
  }
}

export async function closePullRequest(prNumber: number) {
  const octokit = await getRepoOctokit()
  await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: env.githubOwner,
    repo: env.githubRepo,
    pull_number: prNumber,
    state: 'closed',
  })

  return { ok: true }
}
