import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { fixRouter } from './routes/fix.js'
import { githubRouter } from './routes/github.js'
import { healthRouter } from './routes/health.js'
import { metricsRouter } from './routes/metrics.js'
import { policyRouter } from './routes/policy.js'

const app = express()
const normalizedBasePath = normalizeBasePath(env.apiBasePath)
const allowedOrigins = env.frontendOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowAnyOrigin = allowedOrigins.includes('*')

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowAnyOrigin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`))
    },
    credentials: !allowAnyOrigin,
  }),
)
app.use(express.json({ limit: '20mb' }))

app.use(healthRouter)
mountWithOptionalBasePath(metricsRouter)
mountWithOptionalBasePath(githubRouter)
mountWithOptionalBasePath(fixRouter)
mountWithOptionalBasePath(policyRouter)
if (normalizedBasePath !== '/') {
  app.use(normalizedBasePath, healthRouter)
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unexpected server error'
  const status =
    typeof err === 'object' && err && 'status' in err && typeof err.status === 'number' ? err.status : 500

  res.status(status).json({
    error: message,
  })
})

app.listen(env.port, () => {
  console.log(`controlplane-api listening on http://localhost:${env.port}`)
})

function normalizeBasePath(rawPath?: string) {
  const trimmed = rawPath?.trim()
  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

function mountWithOptionalBasePath(router: express.Router) {
  if (normalizedBasePath === '/') {
    app.use(router)
    return
  }

  app.use(normalizedBasePath, router)
}
