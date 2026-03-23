import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type PolicyStatus = 'active' | 'draft' | 'paused'
export type PolicyProvider = 'gemini' | 'fallback'
export type PolicySeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface RegistryPullRequest {
  number: number
  htmlUrl: string
  title: string
}

export interface RegistryPolicy {
  id: string
  name: string
  description: string
  source: string
  checks: number
  status: PolicyStatus
  createdAt: string
  lastUpdated: string
  yaml: string
  policyPath: string
  provider: PolicyProvider
  policyId: string
  category: string
  severity: PolicySeverity
  targetProvider: string
  appliedPullRequest?: RegistryPullRequest | null
  sourcePolicyId?: string
  sourcePolicyTitle?: string
}

interface RegistryStore {
  policies: RegistryPolicy[]
}

const STORE_PATH = path.resolve(process.cwd(), 'data', 'policy-registry.json')

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePullRequest(value: unknown): RegistryPullRequest | null | undefined {
  if (value == null) {
    return null
  }

  if (!isPlainObject(value)) {
    return undefined
  }

  if (typeof value.number !== 'number' || typeof value.htmlUrl !== 'string' || typeof value.title !== 'string') {
    return undefined
  }

  return {
    number: value.number,
    htmlUrl: value.htmlUrl,
    title: value.title,
  }
}

function normalizePolicy(value: unknown): RegistryPolicy | null {
  if (!isPlainObject(value)) {
    return null
  }

  const appliedPullRequest = normalizePullRequest(value.appliedPullRequest)
  if (value.appliedPullRequest != null && appliedPullRequest === undefined) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.checks !== 'number' ||
    typeof value.status !== 'string' ||
    typeof value.lastUpdated !== 'string' ||
    typeof value.yaml !== 'string' ||
    typeof value.policyPath !== 'string' ||
    typeof value.provider !== 'string' ||
    typeof value.policyId !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.severity !== 'string' ||
    typeof value.targetProvider !== 'string'
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    description: value.description,
    source: value.source,
    checks: value.checks,
    status: value.status as PolicyStatus,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : value.lastUpdated,
    lastUpdated: value.lastUpdated,
    yaml: value.yaml,
    policyPath: value.policyPath,
    provider: value.provider as PolicyProvider,
    policyId: value.policyId,
    category: value.category,
    severity: value.severity as PolicySeverity,
    targetProvider: value.targetProvider,
    appliedPullRequest: appliedPullRequest ?? null,
    sourcePolicyId: typeof value.sourcePolicyId === 'string' ? value.sourcePolicyId : undefined,
    sourcePolicyTitle: typeof value.sourcePolicyTitle === 'string' ? value.sourcePolicyTitle : undefined,
  }
}

async function ensureStoreDir() {
  await mkdir(path.dirname(STORE_PATH), { recursive: true })
}

async function readStore(): Promise<RegistryStore> {
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { policies?: unknown }
    const policies = Array.isArray(parsed.policies) ? parsed.policies.map(normalizePolicy).filter(Boolean) as RegistryPolicy[] : []
    return { policies }
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') {
      return { policies: [] }
    }

    throw error
  }
}

async function writeStore(store: RegistryStore) {
  await ensureStoreDir()
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

export async function listRegistryPolicies() {
  const store = await readStore()
  return store.policies
}

export async function getRegistryPolicy(id: string) {
  const store = await readStore()
  return store.policies.find((policy) => policy.id === id) || null
}

export async function createRegistryPolicies(input: RegistryPolicy[]) {
  const store = await readStore()
  const existingIds = new Set(store.policies.map((policy) => policy.id))
  const nextPolicies: RegistryPolicy[] = []

  for (const policy of input) {
    if (existingIds.has(policy.id)) {
      continue
    }

    existingIds.add(policy.id)
    nextPolicies.push({
      ...policy,
      createdAt: typeof policy.createdAt === 'string' && policy.createdAt ? policy.createdAt : policy.lastUpdated,
    })
  }

  const policies = [...nextPolicies, ...store.policies]
  await writeStore({ policies })
  return nextPolicies
}

export async function updateRegistryPolicy(id: string, patch: Partial<RegistryPolicy>) {
  const store = await readStore()
  const index = store.policies.findIndex((policy) => policy.id === id)
  if (index < 0) {
    return null
  }

  const current = store.policies[index]
  const next: RegistryPolicy = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
  }
  store.policies[index] = next
  await writeStore(store)
  return next
}

export async function deleteRegistryPolicy(id: string) {
  const store = await readStore()
  const nextPolicies = store.policies.filter((policy) => policy.id !== id)
  if (nextPolicies.length === store.policies.length) {
    return false
  }

  await writeStore({ policies: nextPolicies })
  return true
}
