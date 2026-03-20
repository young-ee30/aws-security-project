import { existsSync, readFileSync } from 'node:fs'
import { App } from 'octokit'
import { env } from '../config/env.js'

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim()
  const fromFile = existsSync(trimmed) ? readFileSync(trimmed, 'utf8') : trimmed
  const withoutEscapedNewlines = fromFile.includes('\\n') ? fromFile.replace(/\\n/g, '\n') : fromFile
  const normalized = withoutEscapedNewlines.replace(/\r\n/g, '\n').trim()

  if (!normalized.includes('BEGIN') || !normalized.includes('PRIVATE KEY')) {
    throw new Error(
      'GITHUB_APP_PRIVATE_KEY must be the PEM text itself or a readable path to a .pem file.',
    )
  }

  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function toGithubAppAuthError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('DECODER routines::unsupported')) {
    return new Error(
      'GitHub App private key could not be parsed. ' +
        'Check GITHUB_APP_PRIVATE_KEY. Use the downloaded .pem file path or the full PEM text with \\n line breaks.',
    )
  }

  return error instanceof Error ? error : new Error(message)
}

let githubApp: App

try {
  const appOptions: ConstructorParameters<typeof App>[0] = {
    appId: env.githubAppId,
    privateKey: normalizePrivateKey(env.githubAppPrivateKey),
  }

  if (env.githubWebhookSecret) {
    appOptions.webhooks = { secret: env.githubWebhookSecret }
  }

  githubApp = new App(appOptions)
} catch (error) {
  const detail = error instanceof Error ? error.message : 'Unknown error'
  throw new Error(
    `Failed to initialize GitHub App. Check GITHUB_APP_PRIVATE_KEY formatting. ` +
      `Use the PEM text with \\n line breaks or set GITHUB_APP_PRIVATE_KEY to the path of the downloaded .pem file. ` +
      `Original error: ${detail}`,
  )
}
export { githubApp }

export async function getRepositoryMetadata() {
  let response

  try {
    const octokit = await getRepoOctokit()

    response = await octokit.request('GET /repos/{owner}/{repo}', {
      owner: env.githubOwner,
      repo: env.githubRepo,
    })
  } catch (error) {
    throw toGithubAppAuthError(error)
  }

  return response.data
}

export async function getInstallationForRepository() {
  let response

  try {
    response = await githubApp.octokit.request('GET /repos/{owner}/{repo}/installation', {
      owner: env.githubOwner,
      repo: env.githubRepo,
    })
  } catch (error) {
    throw toGithubAppAuthError(error)
  }

  return response.data
}

export async function getRepoOctokit() {
  try {
    const installation = await getInstallationForRepository()
    return githubApp.getInstallationOctokit(installation.id)
  } catch (error) {
    throw toGithubAppAuthError(error)
  }
}

export async function getInstallationToken(): Promise<string> {
  let auth

  try {
    const octokit = await getRepoOctokit()
    auth = await octokit.auth({ type: 'installation' })
  } catch (error) {
    throw toGithubAppAuthError(error)
  }

  if (!auth || typeof auth !== 'object' || !('token' in auth) || typeof auth.token !== 'string') {
    throw new Error('Failed to resolve GitHub App installation token')
  }

  return auth.token
}
