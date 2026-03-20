import cors from 'cors'
import express from 'express'
import { env } from './config/env.js'
import { fixRouter } from './routes/fix.js'
import { githubRouter } from './routes/github.js'
import { healthRouter } from './routes/health.js'
import { policyRouter } from './routes/policy.js'

const app = express()

app.use(
  cors({
    origin: env.frontendOrigin,
    credentials: true,
  }),
)
app.use(express.json({ limit: '20mb' }))

app.use(healthRouter)
app.use(githubRouter)
app.use(fixRouter)
app.use(policyRouter)

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
