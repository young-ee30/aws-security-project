import { Router } from 'express'
import { analyzeIncidentLogs } from '../incident/analyze.js'

interface IncidentAnalyzeBody {
  page?: 'gwanje' | 'hae'
  title?: string
  context?: string
  lastUpdated?: string
  summaryCards?: Array<{
    title?: string
    value?: string
    sub?: string
    source?: string
  }>
  logLines?: Array<{
    time?: string
    text?: string
    severity?: 'info' | 'low' | 'medium' | 'high' | 'warn' | 'error'
    source?: string
  }>
}

export const incidentRouter = Router()

incidentRouter.post('/api/incidents/analyze', async (req, res, next) => {
  try {
    const body = (req.body || {}) as IncidentAnalyzeBody
    const result = await analyzeIncidentLogs({
      page: body.page || 'gwanje',
      title: body.title,
      context: body.context,
      lastUpdated: body.lastUpdated,
      summaryCards: Array.isArray(body.summaryCards)
        ? body.summaryCards.map((card) => ({
            title: card?.title || '',
            value: card?.value || '',
            sub: card?.sub,
            source: card?.source,
          }))
        : [],
      logLines: Array.isArray(body.logLines)
        ? body.logLines.map((log) => ({
            time: log?.time,
            text: log?.text || '',
            severity: log?.severity,
            source: log?.source,
          }))
        : [],
    })

    res.json(result)
  } catch (error) {
    next(error)
  }
})
