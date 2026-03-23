import { Router } from 'express'
import { createPullRequestFromFiles } from '../github/changes.js'
import { generateFixSuggestion } from '../fix/suggest.js'

interface ConfirmRequestBody {
  baseBranch?: string
  branchName?: string
  commitMessage?: string
  prTitle?: string
  prBody?: string
  files?: Array<{
    path: string
    content: string
  }>
}

interface SuggestRequestBody {
  jobId?: number
  jobName?: string
  stepName?: string
  stepNumber?: number
  stepStatus?: string
  stepConclusion?: string | null
  stepLog?: string
  annotations?: Array<{
    title?: string | null
    message?: string | null
    path?: string | null
    count?: number | null
  }>
}

export const fixRouter = Router()

fixRouter.post('/api/github/fix-sessions/:runId/suggest', async (req, res, next) => {
  try {
    const runId = req.params.runId
    const body = (req.body || {}) as SuggestRequestBody
    const suggestion = await generateFixSuggestion(runId, {
      jobId: typeof body.jobId === 'number' && !Number.isNaN(body.jobId) ? body.jobId : undefined,
      jobName: typeof body.jobName === 'string' ? body.jobName : undefined,
      stepName: typeof body.stepName === 'string' ? body.stepName : undefined,
      stepNumber: typeof body.stepNumber === 'number' && !Number.isNaN(body.stepNumber) ? body.stepNumber : undefined,
      stepStatus: typeof body.stepStatus === 'string' ? body.stepStatus : undefined,
      stepConclusion: typeof body.stepConclusion === 'string' ? body.stepConclusion : undefined,
      stepLog: typeof body.stepLog === 'string' ? body.stepLog : undefined,
      annotations: Array.isArray(body.annotations)
        ? body.annotations
          .map((annotation) => ({
            title: typeof annotation?.title === 'string' ? annotation.title : null,
            message: typeof annotation?.message === 'string' ? annotation.message : null,
            path: typeof annotation?.path === 'string' ? annotation.path : null,
            count: typeof annotation?.count === 'number' && !Number.isNaN(annotation.count) ? annotation.count : null,
          }))
          .filter((annotation) => annotation.title || annotation.message)
        : undefined,
    })
    res.json(suggestion)
  } catch (error) {
    next(error)
  }
})

fixRouter.post('/api/github/fix-sessions/:runId/confirm', async (req, res, next) => {
  try {
    const runId = req.params.runId
    const body = req.body as ConfirmRequestBody
    const files = body.files || []

    if (files.length === 0) {
      res.status(400).json({ error: 'files must contain at least one file change' })
      return
    }

    const invalid = files.find((file) => typeof file.path !== 'string' || typeof file.content !== 'string')
    if (invalid) {
      res.status(400).json({ error: 'Each file must include string path and content' })
      return
    }

    const result = await createPullRequestFromFiles({
      runId,
      baseBranch: body.baseBranch,
      branchName: body.branchName,
      commitMessage: body.commitMessage,
      prTitle: body.prTitle,
      prBody: body.prBody,
      files,
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})
