import dotenv from 'dotenv'

dotenv.config()

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`)
  }
  return parsed
}

export const env = {
  port: optionalNumber('PORT', 4000),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendOrigin: optional('FRONTEND_ORIGIN', 'http://localhost:5173'),
  githubOwner: required('GITHUB_OWNER'),
  githubRepo: required('GITHUB_REPO'),
  githubAppId: Number(required('GITHUB_APP_ID')),
  githubAppClientId: optional('GITHUB_APP_CLIENT_ID'),
  githubAppPrivateKey: required('GITHUB_APP_PRIVATE_KEY'),
  githubWebhookSecret: optional('GITHUB_WEBHOOK_SECRET'),
  llmProvider: optional('LLM_PROVIDER', 'gemini'),
  geminiApiKey: optional('GEMINI_API_KEY') || optional('LLM_API_KEY'),
  llmApiKey: optional('GEMINI_API_KEY') || optional('LLM_API_KEY'),
  llmModel: optional('GEMINI_MODEL') || optional('LLM_MODEL', 'gemini-2.5-flash-lite'),
}

if (Number.isNaN(env.githubAppId)) {
  throw new Error('GITHUB_APP_ID must be a valid number')
}
