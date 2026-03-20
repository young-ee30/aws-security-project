import { PDFParse } from 'pdf-parse'
import type { LlmProvider } from '../llm/client.js'
import { callConfiguredLlm, resolveProvider } from '../llm/client.js'

const CHECKOV_CATEGORIES = [
  'GENERAL_SECURITY',
  'LOGGING',
  'ENCRYPTION',
  'NETWORKING',
  'IAM',
  'BACKUP_AND_RECOVERY',
  'CONVENTION',
  'SECRETS',
  'KUBERNETES',
  'APPLICATION_SECURITY',
  'SUPPLY_CHAIN',
  'API_SECURITY',
] as const

const CHECKOV_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const CHECKOV_PROVIDERS = ['aws', 'azure', 'gcp', 'kubernetes', 'github_actions'] as const
const PREFERRED_AWS_TERRAFORM_RESOURCE_TYPES = [
  'aws_security_group',
  'aws_s3_bucket',
  'aws_s3_bucket_public_access_block',
  'aws_db_instance',
  'aws_rds_cluster',
  'aws_iam_role',
  'aws_kms_key',
  'aws_cloudtrail',
  'aws_launch_template',
  'aws_lb',
  'aws_lb_listener',
  'aws_elasticache_replication_group',
  'aws_cloudwatch_log_group',
] as const

type CheckovCategory = (typeof CHECKOV_CATEGORIES)[number]
type CheckovSeverity = (typeof CHECKOV_SEVERITIES)[number]
type CheckovProvider = (typeof CHECKOV_PROVIDERS)[number]
type PolicyGenerationMode = 'llm' | 'fallback'
type PolicyProvider = LlmProvider | 'fallback'
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]

interface JsonObject {
  [key: string]: JsonValue
}

interface LlmPolicyDraft {
  sourcePolicyId?: unknown
  sourcePolicyTitle?: unknown
  conversionStatus?: unknown
  reason?: unknown
  policyName?: unknown
  description?: unknown
  summary?: unknown
  policyId?: unknown
  category?: unknown
  severity?: unknown
  provider?: unknown
  guideline?: unknown
  fileName?: unknown
  definition?: unknown
}

interface SourcePolicyItem {
  ordinal: number
  sourcePolicyId: string
  sourcePolicyTitle: string
  content: string
}

interface ResolvedPolicyDraft {
  sourcePolicyId: string
  sourcePolicyTitle: string
  policyName: string
  description: string
  summary: string
  policyId: string
  category: CheckovCategory
  severity: CheckovSeverity
  provider: CheckovProvider
  guideline?: string
  fileName: string
  definition: JsonObject
}

interface GeneratedPolicyArtifact {
  sourcePolicyId: string
  sourcePolicyTitle: string
  policyName: string
  description: string
  summary: string
  category: CheckovCategory
  severity: CheckovSeverity
  targetProvider: CheckovProvider
  policyId: string
  policyPath: string
  yaml: string
}

interface LlmPolicyBatch {
  summary?: string
  drafts: LlmPolicyDraft[]
}

interface LlmGenerationResult {
  drafts: ResolvedPolicyDraft[]
  summary: string
  provider: LlmProvider
  attemptedProvider: LlmProvider
  skippedPolicies?: Array<{
    sourcePolicyId: string
    sourcePolicyTitle: string
    reason: string
  }>
  error?: string
}

interface FallbackPolicyTemplate {
  key: string
  title: string
  description: string
  summary: string
  category: CheckovCategory
  severity: CheckovSeverity
  matches: RegExp[]
  definition: JsonObject
}

const FALLBACK_POLICY_TEMPLATES: FallbackPolicyTemplate[] = [
  {
    key: 'disable-public-ip',
    title: 'Disable Public IP Assignment',
    description: 'Require internal Terraform-managed AWS compute or database resources to avoid public IP exposure.',
    summary: 'Derived a networking control that restricts public IP exposure for internal AWS resources.',
    category: 'NETWORKING',
    severity: 'HIGH',
    matches: [/public ip/i, /publicly accessible/i, /associate public ip/i, /공용\s*ip/i, /퍼블릭\s*ip/i, /외부 공개/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_db_instance'],
      attribute: 'publicly_accessible',
      operator: 'equals',
      value: false,
    },
  },
  {
    key: 'restrict-public-ingress',
    title: 'Restrict Public Security Group Ingress',
    description: 'Block 0.0.0.0/0 ingress in AWS security groups unless an explicit exception exists.',
    summary: 'Derived a networking control that blocks public ingress from the uploaded guidance.',
    category: 'NETWORKING',
    severity: 'HIGH',
    matches: [/security group/i, /ingress/i, /0\.0\.0\.0\/0/i, /\bssh\b/i, /22\/tcp/i, /public access/i],
    definition: {
      not: {
        cond_type: 'attribute',
        resource_types: ['aws_security_group'],
        attribute: 'ingress.*.cidr_blocks',
        operator: 'contains',
        value: '0.0.0.0/0',
      },
    },
  },
  {
    key: 'require-s3-public-access-block',
    title: 'Require S3 Public Access Block',
    description: 'Require S3 public access blocking controls for Terraform-managed buckets.',
    summary: 'Derived an S3 hardening control that requires public access blocking.',
    category: 'GENERAL_SECURITY',
    severity: 'HIGH',
    matches: [/s3/i, /bucket/i, /public access block/i, /block public/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_s3_bucket_public_access_block'],
      attribute: 'block_public_policy',
      operator: 'equals',
      value: true,
    },
  },
  {
    key: 'require-s3-encryption',
    title: 'Require S3 Encryption',
    description: 'Require server-side encryption configuration on S3 buckets.',
    summary: 'Derived an encryption control for S3 buckets from the uploaded guidance.',
    category: 'ENCRYPTION',
    severity: 'HIGH',
    matches: [/s3/i, /bucket/i, /encrypt/i, /encryption/i, /kms/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_s3_bucket'],
      attribute: 'server_side_encryption_configuration',
      operator: 'exists',
    },
  },
  {
    key: 'require-rds-encryption',
    title: 'Require RDS Encryption',
    description: 'Require storage encryption for RDS instances and clusters.',
    summary: 'Derived a database encryption control for RDS resources.',
    category: 'ENCRYPTION',
    severity: 'HIGH',
    matches: [/\brds\b/i, /database/i, /db instance/i, /storage encrypted/i, /encrypt/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_db_instance', 'aws_rds_cluster'],
      attribute: 'storage_encrypted',
      operator: 'equals',
      value: true,
    },
  },
  {
    key: 'enable-cloudtrail-logging',
    title: 'Enable CloudTrail Logging',
    description: 'Require CloudTrail logging to remain enabled for account audit coverage.',
    summary: 'Derived an audit logging control that checks CloudTrail logging.',
    category: 'LOGGING',
    severity: 'MEDIUM',
    matches: [/cloudtrail/i, /audit/i, /logging/i, /log collection/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_cloudtrail'],
      attribute: 'enable_logging',
      operator: 'equals',
      value: true,
    },
  },
  {
    key: 'require-kms-key-rotation',
    title: 'Require KMS Key Rotation',
    description: 'Require automatic rotation for customer-managed AWS KMS keys.',
    summary: 'Derived a KMS control that checks automatic key rotation.',
    category: 'ENCRYPTION',
    severity: 'MEDIUM',
    matches: [/\bkms\b/i, /key rotation/i, /customer managed key/i, /\bcmk\b/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_kms_key'],
      attribute: 'enable_key_rotation',
      operator: 'equals',
      value: true,
    },
  },
  {
    key: 'require-imdsv2',
    title: 'Require IMDSv2',
    description: 'Require IMDSv2 for EC2 launch templates by enforcing http_tokens=required.',
    summary: 'Derived an EC2 metadata protection control that requires IMDSv2.',
    category: 'GENERAL_SECURITY',
    severity: 'HIGH',
    matches: [/imds/i, /metadata service/i, /ec2/i, /launch template/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_launch_template'],
      attribute: 'metadata_options.http_tokens',
      operator: 'equals',
      value: 'required',
    },
  },
  {
    key: 'require-resource-tags',
    title: 'Require Resource Tags',
    description: 'Require Terraform-managed AWS resources to define tags for ownership and traceability.',
    summary: 'Derived a convention control that checks for AWS resource tags.',
    category: 'CONVENTION',
    severity: 'LOW',
    matches: [/\btag\b/i, /\blabel\b/i, /\bowner\b/i, /\benv\b/i, /traceability/i],
    definition: {
      cond_type: 'attribute',
      resource_types: ['aws_security_group', 'aws_s3_bucket', 'aws_db_instance'],
      attribute: 'tags',
      operator: 'exists',
    },
  },
]

export interface GeneratePolicyRequest {
  fileName: string
  contentBase64: string
  mimeType?: string
}

export interface GeneratePolicyResponse {
  ok: true
  mode: PolicyGenerationMode
  provider: PolicyProvider
  attemptedProvider?: LlmProvider
  llmError?: string
  fileName: string
  summary: string
  policyCount: number
  policies: GeneratedPolicyArtifact[]
  skippedPolicies?: Array<{
    sourcePolicyId: string
    sourcePolicyTitle: string
    reason: string
  }>
}

function createHttpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase()
}

function humanizeFileName(fileName: string) {
  const baseName = fileName.replace(/\.pdf$/i, '')
  const words = baseName
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word))

  return words.length > 0 ? words.join(' ') : 'Generated Checkov Policy'
}

function toPolicyFileName(value: string, fallback = 'custom-policy') {
  return `${slugify(value) || fallback}.yaml`
}

function normalizeSourcePolicyId(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/([A-Z]+)(\d+)/g, '$1-$2')
    .replace(/-+/g, '-')
}

function cleanPolicyTitle(value: string) {
  return value
    .trim()
    .replace(/^[\-:.)\]]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
}

function parseSourcePolicyHeading(line: string) {
  const match = line.match(/^\s*(?:\d+\.\s*)?(?<id>[A-Z]{1,6}[-_ ]?\d{2,4}(?:[-_ ]?\d{1,4})?)(?:\s*[:.)-]\s*|\s+)(?<title>.+)?$/i)
  if (!match?.groups?.id) {
    return null
  }

  const sourcePolicyId = normalizeSourcePolicyId(match.groups.id)
  if (!/^[A-Z]{1,6}-\d{2,4}(?:-\d{1,4})?$/.test(sourcePolicyId)) {
    return null
  }

  return {
    sourcePolicyId,
    sourcePolicyTitle: cleanPolicyTitle(match.groups.title || ''),
  }
}

function normalizeWhitespace(text: string) {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim()
}

function pickSummarySentence(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 40 && part.length <= 220)

  return sentences[0] || ''
}

function extractSourcePolicies(fileName: string, text: string): SourcePolicyItem[] {
  const lines = normalizeWhitespace(text)
    .split('\n')
    .map((line) => line.trim())

  const candidates: Array<{ sourcePolicyId: string; sourcePolicyTitle: string; lines: string[] }> = []
  let current: { sourcePolicyId: string; sourcePolicyTitle: string; lines: string[] } | null = null

  for (const line of lines) {
    if (!line) {
      if (current) current.lines.push('')
      continue
    }

    const heading = parseSourcePolicyHeading(line)
    if (heading) {
      if (current) {
        candidates.push(current)
      }

      current = {
        sourcePolicyId: heading.sourcePolicyId,
        sourcePolicyTitle: heading.sourcePolicyTitle,
        lines: [],
      }
      continue
    }

    if (current) {
      current.lines.push(line)
    }
  }

  if (current) {
    candidates.push(current)
  }

  if (candidates.length === 0) {
    const regexMatches = [...normalizeWhitespace(text).matchAll(/\b([A-Z]{1,6})\s*[-_ ]\s*(\d{2,4}(?:\s*[-_ ]\s*\d{1,4})?)\b/g)]
    if (regexMatches.length > 0) {
      const segmented = regexMatches.map((match, index) => {
        const fullMatch = match[0]
        const sourcePolicyId = normalizeSourcePolicyId(`${match[1]}-${match[2]}`)
        const start = match.index ?? 0
        const contentStart = start
        const contentEnd = index + 1 < regexMatches.length ? (regexMatches[index + 1].index ?? text.length) : text.length
        const content = normalizeWhitespace(text.slice(contentStart, contentEnd))
        const titleCandidate = cleanPolicyTitle(content.slice(fullMatch.length).split('\n')[0] || '')

        return {
          ordinal: index + 1,
          sourcePolicyId,
          sourcePolicyTitle: titleCandidate || `Extracted Policy ${sourcePolicyId}`,
          content: content || `${sourcePolicyId} ${titleCandidate}`.trim(),
        }
      })

      if (segmented.length > 0) {
        const unique = new Map<string, SourcePolicyItem>()
        for (const item of segmented) {
          if (!unique.has(item.sourcePolicyId)) {
            unique.set(item.sourcePolicyId, item)
          }
        }

        return [...unique.values()]
      }
    }

    return [
      {
        ordinal: 1,
        sourcePolicyId: 'POLICY-1',
        sourcePolicyTitle: humanizeFileName(fileName),
        content: text,
      },
    ]
  }

  const seenIds = new Map<string, number>()

  return candidates.map((candidate, index) => {
    const body = candidate.lines.join('\n').trim()
    const fallbackTitle = body
      .split('\n')
      .map((line) => cleanPolicyTitle(line))
      .find((line) => line.length >= 4 && line.length <= 120)
    const baseId = candidate.sourcePolicyId || `POLICY-${index + 1}`
    const seenCount = seenIds.get(baseId) || 0
    seenIds.set(baseId, seenCount + 1)
    const sourcePolicyId = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`

    return {
      ordinal: index + 1,
      sourcePolicyId,
      sourcePolicyTitle: candidate.sourcePolicyTitle || fallbackTitle || `Extracted Policy ${index + 1}`,
      content: body || candidate.sourcePolicyTitle || sourcePolicyId,
    }
  })
}

function trimSourcePolicyText(text: string) {
  return text.length > 1800 ? `${text.slice(0, 1800)}\n[truncated]` : text
}

function buildSourcePolicyPrompt(sourcePolicy: SourcePolicyItem) {
  return [
    `Policy ${sourcePolicy.ordinal}`,
    `source_policy_id: ${sourcePolicy.sourcePolicyId}`,
    `source_policy_title: ${sourcePolicy.sourcePolicyTitle}`,
    'text:',
    '```text',
    trimSourcePolicyText(sourcePolicy.content),
    '```',
    '',
    'Return exactly one result item for this source policy.',
  ].join('\n')
}

function buildMinimalDefinitionPrompt(fileName: string, sourcePolicy: SourcePolicyItem, classification: LlmPolicyDraft) {
  return [
    `PDF file: ${fileName}`,
    '',
    buildSourcePolicyPrompt(sourcePolicy),
    '',
    `policy_name: ${typeof classification.policyName === 'string' ? classification.policyName : sourcePolicy.sourcePolicyTitle}`,
    `category: ${typeof classification.category === 'string' ? classification.category : 'GENERAL_SECURITY'}`,
    `severity: ${typeof classification.severity === 'string' ? classification.severity : 'MEDIUM'}`,
    '',
    'Return only the shortest valid definition.',
    'Use a single attribute rule or a single not-wrapped attribute rule.',
    'Do not use checks arrays or composite operators.',
  ].join('\n')
}
function isConvertibleDraft(draft: LlmPolicyDraft) {
  if (typeof draft.conversionStatus === 'string') {
    return draft.conversionStatus.trim().toLowerCase() === 'convertible'
  }

  return isPlainObject(draft.definition)
}

function detectProvider(_text: string): CheckovProvider {
  return 'aws'
}

function extractPreferredAwsResourceTypes(text: string) {
  const lower = text.toLowerCase()
  const matches: string[] = []

  if (/security group|ssh|22\/tcp|0\.0\.0\.0\/0|ingress|egress/.test(lower)) matches.push('aws_security_group')
  if (/s3|bucket|public access block|versioning|server-side encryption/.test(lower)) {
    matches.push('aws_s3_bucket', 'aws_s3_bucket_public_access_block')
  }
  if (/rds|database|db instance|mysql|postgres/.test(lower)) matches.push('aws_db_instance', 'aws_rds_cluster')
  if (/iam|role|least privilege|trust policy/.test(lower)) matches.push('aws_iam_role')
  if (/kms|key management|customer managed key|cmk/.test(lower)) matches.push('aws_kms_key')
  if (/cloudtrail|audit trail|logging/.test(lower)) matches.push('aws_cloudtrail', 'aws_cloudwatch_log_group')
  if (/load balancer|alb|elb|tls|https listener/.test(lower)) matches.push('aws_lb', 'aws_lb_listener')
  if (/launch template|imds|metadata service|ec2/.test(lower)) matches.push('aws_launch_template')
  if (/elasticache|redis|replication group/.test(lower)) matches.push('aws_elasticache_replication_group')

  return [...new Set(matches)].slice(0, 4)
}

function scoreFallbackTemplate(template: FallbackPolicyTemplate, text: string) {
  return template.matches.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0)
}

function selectBestFallbackTemplate(text: string) {
  let bestTemplate: FallbackPolicyTemplate | null = null
  let bestScore = 0

  for (const template of FALLBACK_POLICY_TEMPLATES) {
    const score = scoreFallbackTemplate(template, text)
    if (score > bestScore) {
      bestTemplate = template
      bestScore = score
    }
  }

  return bestScore > 0 ? bestTemplate : null
}

function inferFallbackDefinition(text: string, provider: CheckovProvider): JsonObject {
  const preferredTypes = extractPreferredAwsResourceTypes(text)
  const primaryType = preferredTypes[0] || 'aws_security_group'

  if (/\b(public ip|publicly accessible|associate public ip)\b|공용\s*ip|퍼블릭\s*ip|외부 공개/i.test(text)) {
    if (/\brds\b|database|db instance/i.test(text)) {
      return {
        cond_type: 'attribute',
        resource_types: ['aws_db_instance'],
        attribute: 'publicly_accessible',
        operator: 'equals',
        value: false,
      }
    }

    return {
      cond_type: 'attribute',
      resource_types: ['aws_instance'],
      attribute: 'associate_public_ip_address',
      operator: 'equals',
      value: false,
    }
  }

  if (/0\.0\.0\.0\/0|public access|open to the internet|ssh/i.test(text) && provider === 'aws') {
    return {
      not: {
        cond_type: 'attribute',
        resource_types: ['aws_security_group'],
        attribute: 'ingress.*.cidr_blocks',
        operator: 'contains',
        value: '0.0.0.0/0',
      },
    }
  }

  if (/\b(encrypt|encryption|kms|customer managed key|cmk)\b/i.test(text)) {
    return {
      cond_type: 'attribute',
      resource_types: ['aws_s3_bucket', 'aws_db_instance', 'aws_rds_cluster'],
      attribute: 'kms_key_id',
      operator: 'exists',
    }
  }

  if (/\b(log|logging|audit|cloudtrail)\b/i.test(text)) {
    return {
      cond_type: 'attribute',
      resource_types: ['aws_cloudtrail'],
      attribute: 'enable_logging',
      operator: 'equals',
      value: true,
    }
  }

  return {
    cond_type: 'attribute',
    resource_types: [primaryType],
    attribute: 'tags',
    operator: 'exists',
  }
}

function buildFallbackDraftForSourcePolicy(fileName: string, sourcePolicy: SourcePolicyItem): ResolvedPolicyDraft | null {
  const text = sourcePolicy.content
  const provider = detectProvider(text)
  const sourceTitle = humanizeFileName(fileName)
  const summarySentence = pickSummarySentence(text)
  const template = selectBestFallbackTemplate(text)

  if (!template) {
    return null
  }

  const policyName = `${sourcePolicy.sourcePolicyId} ${sourcePolicy.sourcePolicyTitle}`

  return {
    sourcePolicyId: sourcePolicy.sourcePolicyId,
    sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
    policyName,
    description:
      summarySentence ||
      `${template.description} Source: ${sourceTitle} ${sourcePolicy.sourcePolicyId}.`,
    summary: template.summary,
    policyId: `CKV2_CUSTOM_${slugify(sourcePolicy.sourcePolicyId).replace(/-/g, '_').toUpperCase()}_${slugify(template.key)
      .replace(/-/g, '_')
      .toUpperCase()}_${Date.now().toString().slice(-6)}`,
    category: template.category,
    severity: template.severity,
    provider,
    fileName: toPolicyFileName(`${sourcePolicy.sourcePolicyId}-${sourcePolicy.sourcePolicyTitle}`, template.key),
    definition: template.definition,
  }
}

function buildFallbackDrafts(fileName: string, sourcePolicies: SourcePolicyItem[]) {
  const drafts: ResolvedPolicyDraft[] = []
  const skippedPolicies: Array<{ sourcePolicyId: string; sourcePolicyTitle: string; reason: string }> = []

  for (const sourcePolicy of sourcePolicies) {
    const draft = buildFallbackDraftForSourcePolicy(fileName, sourcePolicy)
    if (draft) {
      drafts.push(draft)
      continue
    }

    skippedPolicies.push({
      sourcePolicyId: sourcePolicy.sourcePolicyId,
      sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
      reason: 'Fallback could not map this source policy to a single Terraform-checkable Checkov rule.',
    })
  }

  return { drafts, skippedPolicies }
}

function buildBaseDraftForSourcePolicy(fileName: string, sourcePolicy: SourcePolicyItem): ResolvedPolicyDraft {
  const provider = detectProvider(sourcePolicy.content)
  const policyName = `${sourcePolicy.sourcePolicyId} ${sourcePolicy.sourcePolicyTitle}`.trim()

  return {
    sourcePolicyId: sourcePolicy.sourcePolicyId,
    sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
    policyName,
    description:
      pickSummarySentence(sourcePolicy.content) ||
      `Derived from ${humanizeFileName(fileName)} ${sourcePolicy.sourcePolicyId}. Review before applying.`,
    summary: `Derived a Terraform AWS control from ${sourcePolicy.sourcePolicyId}.`,
    policyId: `CKV2_CUSTOM_${slugify(sourcePolicy.sourcePolicyId).replace(/-/g, '_').toUpperCase()}_${Date.now()
      .toString()
      .slice(-6)}`,
    category: 'GENERAL_SECURITY',
    severity: 'MEDIUM',
    provider,
    fileName: toPolicyFileName(`${sourcePolicy.sourcePolicyId}-${sourcePolicy.sourcePolicyTitle}`, sourcePolicy.sourcePolicyId),
    definition: inferFallbackDefinition(sourcePolicy.content, provider),
  }
}

function trimTextForPrompt(text: string) {
  return text.length > 24000 ? `${text.slice(0, 24000)}\n\n[truncated]` : text
}

function extractJsonSlice(text: string, openChar: '{' | '[', closeChar: '}' | ']') {
  const start = text.indexOf(openChar)
  const end = text.lastIndexOf(closeChar)

  if (start < 0 || end <= start) {
    return null
  }

  return text.slice(start, end + 1)
}

function parseJsonValue(text: string): unknown | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] || trimmed.match(/```[\w-]*\s*([\s\S]*?)```/i)?.[1]
  const candidates = [
    fenced,
    trimmed,
    extractJsonSlice(trimmed, '{', '}'),
    extractJsonSlice(trimmed, '[', ']'),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }

  return null
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCategory(value: unknown, fallback: CheckovCategory): CheckovCategory {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toUpperCase()
  return CHECKOV_CATEGORIES.includes(normalized as CheckovCategory) ? (normalized as CheckovCategory) : fallback
}

function normalizeSeverity(value: unknown, fallback: CheckovSeverity): CheckovSeverity {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toUpperCase()
  return CHECKOV_SEVERITIES.includes(normalized as CheckovSeverity) ? (normalized as CheckovSeverity) : fallback
}

function normalizeProvider(value: unknown, fallback: CheckovProvider): CheckovProvider {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === 'aws' ? 'aws' : fallback
}

function findResourceTypes(value: JsonValue): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => findResourceTypes(item))
  }

  if (!isPlainObject(value)) {
    return []
  }

  const localMatches = Object.entries(value).flatMap(([key, child]) => {
    if (key === 'resource_types') {
      if (Array.isArray(child)) {
        return child.filter((item): item is string => typeof item === 'string')
      }

      return typeof child === 'string' ? [child] : []
    }

    return findResourceTypes(child)
  })

  return localMatches
}

function hasAwsTerraformResourceTypes(definition: JsonObject) {
  const resourceTypes = findResourceTypes(definition)
  return resourceTypes.some((resourceType) => /^aws_[a-z0-9_]+$/.test(resourceType))
}

function coerceDefinitionToTerraformAws(definition: JsonObject, text: string) {
  if (hasAwsTerraformResourceTypes(definition)) {
    return definition
  }

  return inferFallbackDefinition(text, 'aws')
}

function resolveDraft(fileName: string, text: string, draft: LlmPolicyDraft | null, fallback: ResolvedPolicyDraft) {
  if (!draft) {
    return fallback
  }

  const sourcePolicyId =
    typeof draft.sourcePolicyId === 'string' && draft.sourcePolicyId.trim().length > 0
      ? normalizeSourcePolicyId(draft.sourcePolicyId)
      : fallback.sourcePolicyId
  const sourcePolicyTitle =
    typeof draft.sourcePolicyTitle === 'string' && draft.sourcePolicyTitle.trim().length > 0
      ? cleanPolicyTitle(draft.sourcePolicyTitle)
      : fallback.sourcePolicyTitle
  const policyName =
    typeof draft.policyName === 'string' && draft.policyName.trim().length > 0
      ? draft.policyName.trim()
      : `${sourcePolicyId} ${sourcePolicyTitle}`.trim()

  const fileNameSource =
    typeof draft.fileName === 'string' && draft.fileName.trim().length > 0
      ? draft.fileName.trim()
      : `${sourcePolicyId}-${policyName}`

  const normalizedFileName =
    `${slugify(fileNameSource) || slugify(policyName) || slugify(fileName.replace(/\.pdf$/i, '')) || 'custom-policy'}.yaml`
  const definition =
    isPlainObject(draft.definition) ? coerceDefinitionToTerraformAws(draft.definition, text) : fallback.definition
  const policyId =
    typeof draft.policyId === 'string' && draft.policyId.trim().length > 0
      ? draft.policyId.trim()
      : fallback.policyId

  return {
    sourcePolicyId,
    sourcePolicyTitle,
    policyName,
    description:
      typeof draft.description === 'string' && draft.description.trim().length > 0
        ? draft.description.trim()
        : fallback.description,
    summary:
      typeof draft.summary === 'string' && draft.summary.trim().length > 0 ? draft.summary.trim() : fallback.summary,
    policyId,
    category: normalizeCategory(draft.category, fallback.category),
    severity: normalizeSeverity(draft.severity, fallback.severity),
    provider: normalizeProvider(draft.provider, fallback.provider),
    guideline:
      typeof draft.guideline === 'string' && draft.guideline.trim().length > 0 ? draft.guideline.trim() : undefined,
    fileName: normalizedFileName,
    definition,
  }
}

function getDraftSignature(draft: ResolvedPolicyDraft) {
  const resourceTypes = [...new Set(findResourceTypes(draft.definition))].sort().join(',')
  return `${slugify(draft.policyName)}::${resourceTypes}::${JSON.stringify(draft.definition)}`
}

function uniquifyDrafts(drafts: ResolvedPolicyDraft[]) {
  const fileNames = new Set<string>()
  const policyIds = new Set<string>()

  return drafts.map((draft) => {
    const fileStem = draft.fileName.replace(/\.ya?ml$/i, '') || 'custom-policy'
    let fileName = draft.fileName
    let fileSuffix = 2

    while (fileNames.has(fileName)) {
      fileName = `${fileStem}-${fileSuffix}.yaml`
      fileSuffix += 1
    }
    fileNames.add(fileName)

    let policyId = draft.policyId
    let idSuffix = 2
    while (policyIds.has(policyId)) {
      policyId = `${draft.policyId}_${idSuffix}`
      idSuffix += 1
    }
    policyIds.add(policyId)

    return {
      ...draft,
      fileName,
      policyId,
    }
  })
}

function mergeResolvedDrafts(resolvedDrafts: ResolvedPolicyDraft[], fallbackDrafts: ResolvedPolicyDraft[]) {
  const combined: ResolvedPolicyDraft[] = []
  const seenSignatures = new Set<string>()
  const seenResourceTypes = new Set<string>()

  const pushUnique = (draft: ResolvedPolicyDraft) => {
    const signature = getDraftSignature(draft)
    if (seenSignatures.has(signature)) {
      return
    }

    combined.push(draft)
    seenSignatures.add(signature)
    for (const resourceType of findResourceTypes(draft.definition)) {
      seenResourceTypes.add(resourceType)
    }
  }

  for (const draft of resolvedDrafts) {
    pushUnique(draft)
  }

  for (const draft of fallbackDrafts) {
    const resourceTypes = findResourceTypes(draft.definition)
    const overlaps = resourceTypes.some((resourceType) => seenResourceTypes.has(resourceType))
    if (!overlaps) {
      pushUnique(draft)
    }
  }

  return uniquifyDrafts(combined.slice(0, 8))
}

function extractLlmPolicyBatch(value: unknown): LlmPolicyBatch | null {
  if (Array.isArray(value)) {
    const drafts = value.filter(isPlainObject) as LlmPolicyDraft[]
    return drafts.length > 0 ? { drafts } : null
  }

  if (!isPlainObject(value)) {
    return null
  }

  const summary = typeof value.summary === 'string' && value.summary.trim().length > 0 ? value.summary.trim() : undefined
  const arrayKeys = ['policies', 'controls', 'items', 'drafts']

  for (const key of arrayKeys) {
    const candidate = value[key]
    if (Array.isArray(candidate)) {
      const drafts = candidate.filter(isPlainObject) as LlmPolicyDraft[]
      if (drafts.length > 0) {
        return { summary, drafts }
      }
    }
  }

  if ('definition' in value || 'policyName' in value || 'sourcePolicyId' in value || 'conversionStatus' in value) {
    return {
      summary,
      drafts: [value as unknown as LlmPolicyDraft],
    }
  }

  return null
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return normalizeWhitespace(result.text || '')
  } finally {
    await parser.destroy()
  }
}

function escapeYamlString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function serializeYaml(value: JsonValue, indent = 0): string {
  const pad = ' '.repeat(indent)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'

    return value
      .map((item) => {
        if (Array.isArray(item) || isPlainObject(item)) {
          return `${pad}-\n${serializeYaml(item, indent + 2)}`
        }

        return `${pad}- ${serializeYaml(item, 0)}`
      })
      .join('\n')
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'

    return entries
      .map(([key, child]) => {
        if (Array.isArray(child) || isPlainObject(child)) {
          return `${pad}${key}:\n${serializeYaml(child, indent + 2)}`
        }

        return `${pad}${key}: ${serializeYaml(child, 0)}`
      })
      .join('\n')
  }

  if (typeof value === 'string') {
    if (/^[A-Za-z0-9_.\/-]+$/.test(value)) {
      return value
    }

    return escapeYamlString(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return 'null'
}

function buildCustomPolicyYaml(draft: ResolvedPolicyDraft) {
  const root: JsonObject = {
    metadata: {
      id: draft.policyId,
      name: draft.policyName,
      category: draft.category,
      severity: draft.severity,
      ...(draft.guideline ? { guideline: draft.guideline } : {}),
    },
    scope: {
      provider: draft.provider,
    },
    definition: draft.definition,
  }

  return `---\n${serializeYaml(root)}\n`
}

function buildBatchSummary(fileName: string, count: number, mode: PolicyGenerationMode, llmSummary?: string) {
  if (llmSummary) {
    return llmSummary
  }

  const sourceTitle = humanizeFileName(fileName)
  if (mode === 'llm') {
    if (count === 0) {
      return `Gemini could not produce any valid Checkov custom policies from ${sourceTitle}.`
    }

    return `Generated ${count} Checkov custom policies from ${sourceTitle}.`
  }

  if (count === 0) {
    return `No fallback Checkov custom policies could be generated from ${sourceTitle}.`
  }

  return `LLM output could not be used, so ${count} fallback Checkov custom policies were generated from ${sourceTitle}.`
}

const POLICY_CLASSIFICATION_ATTEMPTS = [{ maxTokens: 1200 }] as const
const POLICY_DEFINITION_ATTEMPTS = [{ maxTokens: 1200 }, { maxTokens: 1800 }] as const
const POLICY_MINIMAL_DEFINITION_ATTEMPTS = [{ maxTokens: 700 }, { maxTokens: 1000 }] as const

function buildPolicyClassificationSystemPrompt() {
  return [
    'You convert one extracted security policy item into one Terraform AWS Checkov policy.',
    'Return JSON only.',
    'Return the most compact valid JSON that satisfies the schema.',
    'This repository is AWS Terraform first. Do not emit Azure, GCP, Kubernetes, GitHub Actions, or generic policies that lack concrete Terraform AWS resource_types.',
    'The source policy item is already extracted for you. Convert it directly in one pass.',
    'Return exactly one JSON object with this schema:',
    '{',
    '  "conversionStatus": "convertible" | "not_convertible",',
    '  "reason": string,',
    '  "policyName": string,',
    '  "category": string,',
    '  "severity": string,',
    '  "guideline": string,',
    '  "definition": object,',
    '}',
    'Do not include sourcePolicyId, sourcePolicyTitle, description, summary, fileName, policyId, or provider.',
    'Omit optional keys instead of emitting empty strings.',
    `Allowed category values: ${CHECKOV_CATEGORIES.join(', ')}.`,
    `Allowed severity values: ${CHECKOV_SEVERITIES.join(', ')}.`,
    'Use "convertible" only if the rule can be validated from Terraform resource types, attributes, or references.',
    'Use "not_convertible" for operational procedures, runtime state, periodic review, or human process requirements.',
    'Keep policyName short and specific.',
    'Keep reason to one short sentence.',
    'If convertible, include the simplest possible Checkov definition.',
    'Prefer a single attribute rule or a single not-wrapped attribute rule.',
    'Do not use checks arrays unless absolutely necessary.',
    'Keep guideline to one short sentence.',
    'Do not return markdown. Do not wrap JSON in prose.',
  ].join('\n')
}

function buildPolicyDefinitionSystemPrompt() {
  return [
    'You generate one Checkov custom policy definition for Terraform AWS.',
    'Return JSON only.',
    'Return the most compact valid JSON that satisfies the schema.',
    'Return exactly one JSON object with this schema:',
    '{',
    '  "guideline": string,',
    '  "definition": object',
    '}',
    'Do not include policyName, category, severity, sourcePolicyId, sourcePolicyTitle, description, summary, fileName, policyId, or provider.',
    'The definition must follow Checkov YAML custom policy syntax.',
    `The definition must target Terraform AWS resource_types such as: ${PREFERRED_AWS_TERRAFORM_RESOURCE_TYPES.join(', ')}.`,
    'Every definition must include at least one aws_* Terraform resource_types entry.',
    'Prefer a single concrete attribute or connection check.',
    'Avoid composite rules unless they are strictly necessary.',
    'Do not use long checks arrays when a single attribute rule or a single not-wrapped attribute rule is sufficient.',
    'Keep guideline to one short sentence.',
    'Do not return markdown. Do not wrap JSON in prose.',
  ].join('\n')
}

function buildMinimalPolicyDefinitionSystemPrompt() {
  return [
    'You generate one minimal Checkov custom policy definition for Terraform AWS.',
    'Return JSON only.',
    'Return exactly one JSON object with this schema:',
    '{',
    '  "definition": object',
    '}',
    'Return the shortest valid JSON possible.',
    'Do not include guideline, policyName, category, severity, sourcePolicyId, sourcePolicyTitle, description, summary, fileName, policyId, or provider.',
    'The definition must follow Checkov YAML custom policy syntax.',
    'Use only one of these minimal shapes:',
    '{ "definition": { "cond_type": "attribute", "resource_types": [string], "attribute": string, "operator": string, "value": string|number|boolean } }',
    '{ "definition": { "not": { "cond_type": "attribute", "resource_types": [string], "attribute": string, "operator": string, "value": string|number|boolean } } }',
    'Do not use checks arrays.',
    'Do not use operator values "and" or "or".',
    'Use exactly one Terraform AWS resource type when possible.',
    'Do not return markdown. Do not wrap JSON in prose.',
  ].join('\n')
}
void POLICY_DEFINITION_ATTEMPTS
void POLICY_MINIMAL_DEFINITION_ATTEMPTS
void buildPolicyDefinitionSystemPrompt
void buildMinimalPolicyDefinitionSystemPrompt
void buildMinimalDefinitionPrompt

function formatLlmJsonError(content: string, finishReason?: string) {
  const preview = content.replace(/\s+/g, ' ').slice(0, 220)
  if (finishReason === 'MAX_TOKENS') {
    return `Gemini response was truncated at MAX_TOKENS before valid JSON could be parsed. Preview: ${preview}`
  }

  return `Gemini returned non-JSON content. Preview: ${preview}${finishReason ? ` (finishReason: ${finishReason})` : ''}`
}

async function generateWithLlm(
  fileName: string,
  sourcePolicies: SourcePolicyItem[],
): Promise<LlmGenerationResult | null> {
  const attemptedProvider = resolveProvider()

  try {
    const resolvedDrafts: ResolvedPolicyDraft[] = []
    const skippedPolicies: Array<{ sourcePolicyId: string; sourcePolicyTitle: string; reason: string }> = []
    const errors: string[] = []

    for (const sourcePolicy of sourcePolicies) {
      let classification: LlmPolicyDraft | null = null
      let classificationError = 'Gemini returned no usable content.'

      for (const attempt of POLICY_CLASSIFICATION_ATTEMPTS) {
        const response = await callConfiguredLlm({
          messages: [
            { role: 'system', content: buildPolicyClassificationSystemPrompt() },
            { role: 'user', content: [`PDF file: ${fileName}`, '', buildSourcePolicyPrompt(sourcePolicy)].join('\n') },
          ],
          temperature: 0.2,
          maxTokens: attempt.maxTokens,
          responseMimeType: 'application/json',
        })

        if (!response?.content) {
          classificationError = `Gemini returned no usable content for ${sourcePolicy.sourcePolicyId}.`
          continue
        }

        const parsed = parseJsonValue(response.content)
        if (!parsed) {
          classificationError = `${sourcePolicy.sourcePolicyId}: ${formatLlmJsonError(response.content, response.finishReason)}`
          continue
        }

        const batch = extractLlmPolicyBatch(parsed)
        const draft = batch?.drafts[0]

        if (!draft) {
          classificationError = `Gemini returned JSON, but no policy conversion result was found for ${sourcePolicy.sourcePolicyId}.`
          continue
        }

        classification = {
          ...draft,
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
        }
        break
      }

      if (!classification) {
        errors.push(classificationError)
        skippedPolicies.push({
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
          reason: `Gemini could not classify this source policy. ${classificationError}`,
        })
        continue
      }

      if (!isConvertibleDraft(classification)) {
        skippedPolicies.push({
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
          reason:
            (typeof classification.reason === 'string' && classification.reason.trim()) ||
            'LLM marked this source policy as not convertible to a Terraform static Checkov rule.',
        })
        continue
      }

      if (isPlainObject(classification.definition)) {
        resolvedDrafts.push(resolveDraft(fileName, sourcePolicy.content, classification, buildBaseDraftForSourcePolicy(fileName, sourcePolicy)))
        continue
      }

      const definitionError = `Gemini returned a convertible result without a valid definition for ${sourcePolicy.sourcePolicyId}.`
      errors.push(definitionError)
      skippedPolicies.push({
        sourcePolicyId: sourcePolicy.sourcePolicyId,
        sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
        reason: definitionError,
      })
    }

    return {
      drafts: uniquifyDrafts(resolvedDrafts),
      skippedPolicies,
      summary: buildBatchSummary(fileName, resolvedDrafts.length, 'llm'),
      provider: attemptedProvider,
      attemptedProvider,
      error: errors[0],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Policy LLM API call failed:', message)
    return {
      drafts: [],
      skippedPolicies: sourcePolicies.map((sourcePolicy) => ({
        sourcePolicyId: sourcePolicy.sourcePolicyId,
        sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
        reason: `Gemini request failed. ${message}`,
      })),
      summary: buildBatchSummary(fileName, 0, 'llm'),
      provider: attemptedProvider,
      attemptedProvider,
      error: message,
    }
  }
}

export async function generatePolicyFromPdf(input: GeneratePolicyRequest): Promise<GeneratePolicyResponse> {
  if (!input.fileName?.trim()) {
    throw createHttpError(400, 'fileName is required')
  }

  if (!input.contentBase64?.trim()) {
    throw createHttpError(400, 'contentBase64 is required')
  }

  if (input.mimeType && input.mimeType !== 'application/pdf') {
    throw createHttpError(400, 'Only PDF uploads are supported')
  }

  if (!input.fileName.toLowerCase().endsWith('.pdf')) {
    throw createHttpError(400, 'fileName must end with .pdf')
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(input.contentBase64, 'base64')
  } catch {
    throw createHttpError(400, 'contentBase64 is not valid base64')
  }

  if (buffer.byteLength === 0) {
    throw createHttpError(400, 'Uploaded PDF is empty')
  }

  let text: string
  try {
    text = await extractPdfText(buffer)
  } catch (error) {
    console.error('PDF parsing failed:', error instanceof Error ? error.message : error)
    throw createHttpError(400, 'Failed to extract text from the PDF')
  }

  if (!text) {
    throw createHttpError(400, 'No readable text was found in the PDF')
  }

  const sourcePolicies = extractSourcePolicies(input.fileName, text)
  const llmResult = await generateWithLlm(input.fileName, sourcePolicies)
  const resolvedDrafts = llmResult?.drafts || []
  const policies = resolvedDrafts.map((draft) => ({
    sourcePolicyId: draft.sourcePolicyId,
    sourcePolicyTitle: draft.sourcePolicyTitle,
    policyName: draft.policyName,
    description: draft.description,
    summary: draft.summary,
    category: draft.category,
    severity: draft.severity,
    targetProvider: draft.provider,
    policyId: draft.policyId,
    policyPath: `security/checkov/custom_policies/${draft.fileName}`,
    yaml: buildCustomPolicyYaml(draft),
  }))

  return {
    ok: true,
    mode: 'llm',
    provider: llmResult?.provider || 'gemini',
    attemptedProvider: llmResult?.attemptedProvider,
    llmError: llmResult?.error,
    fileName: input.fileName,
    summary: llmResult?.summary || buildBatchSummary(input.fileName, policies.length, 'llm'),
    policyCount: policies.length,
    policies,
    skippedPolicies: llmResult?.skippedPolicies || [],
  }
}
