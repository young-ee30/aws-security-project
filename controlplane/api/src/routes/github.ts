import { Router } from 'express'
import {
  dispatchWorkflow,
  getWorkflowRunJobs,
  getWorkflowRunLogs,
  listWorkflowRuns,
  rerunFailedJobs,
} from '../github/actions.js'
import { getInstallationForRepository, getRepositoryMetadata } from '../github/app.js'

export const githubRouter = Router()

githubRouter.get('/api/github/status', async (_req, res, next) => {
  try {
    const [repository, installation] = await Promise.all([
      getRepositoryMetadata(),
      getInstallationForRepository(),
    ])

    res.json({
      ok: true,
      repository: {
        owner: repository.owner.login,
        name: repository.name,
        fullName: repository.full_name,
        defaultBranch: repository.default_branch,
        private: repository.private,
        htmlUrl: repository.html_url,
      },
      app: {
        appId: installation.app_id,
        installationId: installation.id,
        repositorySelection: installation.repository_selection,
        targetType: installation.target_type,
      },
    })
  } catch (error) {
    next(error)
  }
})

githubRouter.get('/api/github/runs', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20
    const runs = await listWorkflowRuns(Number.isNaN(limit) ? 20 : limit)
    res.json({ runs })
  } catch (error) {
    next(error)
  }
})

githubRouter.get('/api/github/runs/:runId/jobs', async (req, res, next) => {
  try {
    const runId = Number(req.params.runId)
    if (Number.isNaN(runId)) {
      res.status(400).json({ error: 'runId must be a number' })
      return
    }

    const jobs = await getWorkflowRunJobs(runId)
    res.json({ runId, jobs })
  } catch (error) {
    next(error)
  }
})

githubRouter.get('/api/github/runs/:runId/logs', async (req, res, next) => {
  try {
    const runId = Number(req.params.runId)
    const jobId = req.query.jobId ? Number(req.query.jobId) : undefined

    if (Number.isNaN(runId) || (req.query.jobId && Number.isNaN(jobId))) {
      res.status(400).json({ error: 'runId and jobId must be numbers' })
      return
    }

    const logs = await getWorkflowRunLogs(runId, jobId)
    res.json(logs)
  } catch (error) {
    next(error)
  }
})

githubRouter.post('/api/github/runs/:runId/rerun-failed', async (req, res, next) => {
  try {
    const runId = Number(req.params.runId)
    if (Number.isNaN(runId)) {
      res.status(400).json({ error: 'runId must be a number' })
      return
    }

    const result = await rerunFailedJobs(runId)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

githubRouter.post('/api/github/workflows/:workflowId/dispatch', async (req, res, next) => {
  try {
    const workflowId = req.params.workflowId
    const ref = typeof req.body?.ref === 'string' ? req.body.ref : undefined
    const inputs = typeof req.body?.inputs === 'object' && req.body?.inputs ? req.body.inputs : undefined

    const result = await dispatchWorkflow(workflowId, ref, inputs)
    res.json(result)
  } catch (error) {
    next(error)
  }
})
