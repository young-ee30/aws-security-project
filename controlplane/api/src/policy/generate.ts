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
type TerraformApplicability = 'yes' | 'partial' | 'no'
type CoverageMode = 'full' | 'partial'
type PolicyGenerationMode = 'llm' | 'fallback'
type PolicyProvider = LlmProvider | 'fallback'
type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]

interface JsonObject {
  [key: string]: JsonValue
}

interface LlmPolicyDraft {
  status?: unknown
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
  coverageMode?: unknown
  coveredConditions?: unknown
  notCoveredConditions?: unknown
  assumptions?: unknown
  limitations?: unknown
  definition?: unknown
}

interface SourcePolicyItem {
  ordinal: number
  sourcePolicyId: string
  sourcePolicyTitle: string
  content: string
}

interface ExtractedPolicySignals {
  likelyConvertible: boolean
  candidateProviders: CheckovProvider[]
  candidateResourceTypes: string[]
  matchedTopics: string[]
}

interface NormalizedControl {
  control_id: string
  title: string
  source_severity: CheckovSeverity
  provider: CheckovProvider
  target_format: 'checkov_yaml'
  terraform_applicability: TerraformApplicability
  coverage_mode: CoverageMode
  control_objective: string
  pass_conditions: string[]
  fail_conditions: string[]
  implementation_examples: string[]
  resource_candidates: string[]
  check_dimensions: string[]
  enforceable_conditions: string[]
  non_enforceable_conditions: string[]
  allowed_evidence_fields: string[]
  forbidden_inferred_evidence: string[]
  required_resource_families: string[][]
  generation_constraints: {
    disallow_hardcoded_resource_names: boolean
    must_report_uncovered_conditions: boolean
    must_not_guess_missing_provider_details: boolean
  }
}

interface LocalPolicyClassificationResult {
  convertible: boolean
  reason: string
  signals: ExtractedPolicySignals
  normalizedControl: NormalizedControl | null
  fallbackDraft: ResolvedPolicyDraft | null
}

interface ExtractedPolicySections {
  purpose?: string
  inspectionCriteria?: string
  risk?: string
  remediation?: string
  excerpt: string
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
  yamlContent?: string
}

interface GeneratedPolicyPackagePolicy {
  id: string
  file_name: string
  title: string
  rationale: string
  resource_types: string[]
  content: string
}

interface GeneratedPolicyPackage {
  status: 'ok' | 'cannot_generate'
  policy_format: string
  coverage_mode: CoverageMode
  policies: GeneratedPolicyPackagePolicy[]
  covered_conditions: string[]
  not_covered_conditions: string[]
  assumptions: string[]
  limitations: string[]
  generation_notes: string[]
}

interface GeneratedPolicyArtifact {
  sourcePolicyId: string
  sourcePolicyTitle: string
  sourceExcerpt?: string
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

const DIMENSION_TO_ALLOWED_EVIDENCE: Record<string, string[]> = {
  network_segmentation: [
    'subnet association',
    'route table association',
    'network boundary separation',
  ],
  routing_topology: [
    'route table association',
    'routing path',
    'gateway attachment',
  ],
  public_exposure: [
    'public exposure attributes',
    'public accessibility attributes',
    'network exposure settings',
  ],
  access_control: [
    'security group rules',
    'network ACL rules',
    'IAM-related attachment evidence',
  ],
  encryption: [
    'encryption attributes',
    'kms configuration',
  ],
  logging: [
    'logging attributes',
    'log delivery configuration',
  ],
}

const DIMENSION_TO_FORBIDDEN_EVIDENCE: Record<string, string[]> = {
  network_segmentation: ['tags', 'naming conventions'],
  routing_topology: ['tags', 'naming conventions'],
  public_exposure: ['tags', 'resource naming conventions'],
  access_control: ['tags', 'resource naming conventions'],
  encryption: ['tags'],
  logging: ['tags'],
}

const DIMENSION_TO_REQUIRED_RESOURCE_FAMILIES: Record<string, string[][]> = {
  network_segmentation: [
    ['aws_subnet', 'aws_route_table'],
  ],
  routing_topology: [
    ['aws_route_table_association', 'aws_internet_gateway', 'aws_nat_gateway'],
  ],
  public_exposure: [
    ['aws_db_instance'],
  ],
}

const REQUIRED_POLICY_PACKAGE_KEYS = [
  'status',
  'policy_format',
  'coverage_mode',
  'policies',
  'covered_conditions',
  'not_covered_conditions',
  'assumptions',
  'limitations',
  'generation_notes',
] as const

const FORBIDDEN_INVENTED_ATTR_PATTERNS = [
  /tags\.NetworkType/i,
  /tags\.subnet_type/i,
  /tags\.public_private/i,
  /tags\.network_type/i,
]

const TAUTOLOGY_PATTERNS = [
  /or:\s*[\r\n]+(?:\s*-\s*[\r\n]+)?\s*not:\s*[\r\n]+\s*attribute:\s*([A-Za-z0-9_.-]+)\s*[\r\n]+\s*(?:operator:\s*equals|equals:)\s*public[\s\S]*not:\s*[\r\n]+\s*attribute:\s*\1\s*[\r\n]+\s*(?:operator:\s*equals|equals:)\s*private/is,
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

function getCustomPolicySuffix(sourcePolicyId: string) {
  return normalizeSourcePolicyId(sourcePolicyId).replace(/-/g, '_')
}

function getGeneratedPolicyName(sourcePolicyId: string) {
  return `custom_policy_${getCustomPolicySuffix(sourcePolicyId)}`
}

function getGeneratedPolicyId(sourcePolicyId: string) {
  return `CKV2_CUSTOM_${getCustomPolicySuffix(sourcePolicyId)}`
}

function getGeneratedPolicyFileName(sourcePolicyId: string) {
  return `${getGeneratedPolicyName(sourcePolicyId)}.yaml`
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

function cleanSummaryCandidate(text: string) {
  return normalizeWhitespace(text)
    .replace(/\n+/g, ' ')
    .replace(/^(점검 목적|점검목적|목적|inspection purpose|purpose)\s*[:：-]?\s*/i, '')
    .trim()
}

function looksAbruptSummary(text: string) {
  const normalized = cleanSummaryCandidate(text)
  if (!normalized || /[.!?…]$/.test(normalized)) {
    return false
  }

  return /(권한을|을|를|이|가|은|는|의|및|또는|에서|으로|하고|하며|통해)$/u.test(normalized)
}

function pickSummarySentence(text: string) {
  const normalized = normalizeWhitespace(text)
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(cleanSummaryCandidate)
    .filter(Boolean)
  const sentences = paragraphs.flatMap((paragraph) =>
    paragraph
      .split(/(?<=[.!?])\s+/)
      .map(cleanSummaryCandidate)
      .filter(Boolean),
  )
  const preferred = sentences.find(
    (part) => part.length >= 40 && part.length <= 220 && !looksAbruptSummary(part),
  )

  if (preferred) {
    return preferred
  }

  const paragraphFallback = paragraphs.find(
    (part) => part.length >= 40 && part.length <= 220 && !looksAbruptSummary(part),
  )

  if (paragraphFallback) {
    return paragraphFallback
  }

  const longFallback = paragraphs.find((part) => part.length >= 40) || sentences.find((part) => part.length >= 40) || ''
  if (!longFallback) {
    return ''
  }

  return longFallback.length > 220 ? `${longFallback.slice(0, 217).trimEnd()}...` : longFallback
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

function trimSectionText(text: string, maxLength = 320) {
  const normalized = normalizeWhitespace(text)
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

function normalizeSectionLabelText(value: string) {
  return value
    .toLowerCase()
    .replace(/[:：]/g, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/\s+/g, '')
}

function matchesSectionLabel(line: string, labels: string[]) {
  const normalizedLine = normalizeSectionLabelText(line)
  return labels.some((label) => normalizedLine.startsWith(normalizeSectionLabelText(label)))
}

function collectSectionText(lines: string[], startIndex: number) {
  const collected: string[] = []

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) {
      if (collected.length > 0) break
      continue
    }

    if (index !== startIndex && /^[가-힣A-Za-z][가-힣A-Za-z0-9\s/_-]{0,30}\s*[:：]$/.test(line)) {
      break
    }

    if (
      index !== startIndex &&
      matchesSectionLabel(line, [
        '점검 목적',
        '점검목적',
        '목적',
        '판단 기준',
        '판단기준',
        '점검 기준',
        '점검기준',
        '점검 항목',
        '점검항목',
        '점검 방법',
        '점검방법',
        '위험',
        '위험도',
        '보안 위협',
        '보안위협',
        '조치 방법',
        '조치방법',
        '조치 방안',
        '조치방안',
        '조치 사항',
        '조치사항',
        '대응 방안',
        '대응방안',
        '보안 대책',
        '보안대책',
        '참고',
      ])
    ) {
      break
    }

    collected.push(line)
    if (collected.join(' ').length >= 420) break
  }

  return trimSectionText(collected.join(' '))
}

function extractSectionByLabels(lines: string[], labels: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) {
      continue
    }

    if (matchesSectionLabel(line, labels)) {
      const inline = line.split(/[:：]/).slice(1).join(':').trim()
      if (inline) {
        return trimSectionText(inline)
      }

      const collected = collectSectionText(lines, index + 1)
      if (collected) {
        return collected
      }
    }
  }

  return undefined
}

function extractPolicySections(sourcePolicy: SourcePolicyItem): ExtractedPolicySections {
  const lines = normalizeWhitespace(sourcePolicy.content)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    purpose: extractSectionByLabels(lines, ['점검 목적', '점검목적', '목적', 'inspection purpose']),
    inspectionCriteria: extractSectionByLabels(lines, [
      '판단 기준',
      '판단기준',
      '점검 기준',
      '점검기준',
      '점검 항목',
      '점검항목',
      '점검 방법',
      '점검방법',
      '보안 대책',
      '보안대책',
      'inspection criteria',
      'criteria',
    ]),
    risk: extractSectionByLabels(lines, ['위험', '위험도', '보안 위협', '보안위협', 'risk']),
    remediation: extractSectionByLabels(lines, [
      '조치 방법',
      '조치방법',
      '조치 방안',
      '조치방안',
      '조치 사항',
      '조치사항',
      '대응 방안',
      '대응방안',
      'remediation',
    ]),
    excerpt: trimSectionText(trimSourcePolicyText(sourcePolicy.content), 900),
  }
}

function collectMatchedTopics(text: string) {
  const topics: string[] = []
  const lower = text.toLowerCase()

  if (/route table|internet gateway|igw|private subnet|라우팅|인터넷 게이트웨이/.test(lower)) topics.push('route-table')
  if (/public ip|publicly accessible|associate public ip|공용 ip/.test(lower)) topics.push('public-ip')
  if (/security group|ingress|egress|0\.0\.0\.0\/0/.test(lower)) topics.push('security-group')
  if (/s3|bucket|public access block/.test(lower)) topics.push('s3-public-access')
  if (/encrypt|encryption|kms|storage encrypted|암호화/.test(lower)) topics.push('encryption')
  if (/cloudtrail|logging|audit|로그/.test(lower)) topics.push('logging')
  if (/backup|retention|보존/.test(lower)) topics.push('backup-retention')
  if (/iam|role|policy|privilege|권한/.test(lower)) topics.push('iam')

  return topics
}

function extractPolicySignals(sourcePolicy: SourcePolicyItem): ExtractedPolicySignals {
  const text = sourcePolicy.content
  const candidateResourceTypes = extractPreferredAwsResourceTypes(text)
  const matchedTopics = collectMatchedTopics(text)
  const nonConvertibleIndicators = /주기적|정기적|운영 절차|사용 여부|실태|휴면|교육|문서화|승인 절차|모니터링 결과|runtime|운영 중/i.test(text)
  const likelyConvertible =
    (candidateResourceTypes.length > 0 || matchedTopics.length > 0) &&
    !nonConvertibleIndicators

  return {
    likelyConvertible,
    candidateProviders: ['aws'],
    candidateResourceTypes,
    matchedTopics,
  }
}

const NON_ENFORCEABLE_CONDITION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /administrator[- ]only|admin only/i, label: 'administrator-only access requirements' },
  { pattern: /appropriate authorization|proper authorization|access approval/i, label: 'appropriate authorization assignment' },
  { pattern: /policy (establishment|definition)|governance|procedure/i, label: 'policy or procedure requirements' },
  { pattern: /periodic|regular review|review frequency|audit cycle/i, label: 'periodic review requirements' },
  { pattern: /human approval|manual approval|operator review/i, label: 'human approval requirements' },
  { pattern: /runtime|running state|operational status/i, label: 'runtime or operational state checks' },
]

function splitConditionSentences(text?: string) {
  if (!text) {
    return []
  }

  return [...new Set(
    text
      .split(/(?<=[.!?])\s+|\n+|•|·|-/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 8),
  )].slice(0, 4)
}

function deriveCheckDimensions(text: string, matchedTopics: string[]) {
  const dimensions = new Set<string>()
  const lower = text.toLowerCase()

  for (const topic of matchedTopics) {
    if (topic === 'public-ip' || topic === 's3-public-access') dimensions.add('public_exposure')
    if (topic === 'route-table') dimensions.add('routing_topology')
    if (topic === 'security-group' || topic === 'iam') dimensions.add('access_control')
    if (topic === 'encryption') dimensions.add('encryption')
    if (topic === 'logging') dimensions.add('logging')
    if (topic === 'backup-retention') dimensions.add('backup_retention')
  }

  if (/public subnet|private subnet|network segmentation|segmentation/i.test(lower)) dimensions.add('network_segmentation')
  if (/public ip|publicly accessible|public access/i.test(lower)) dimensions.add('public_exposure')
  if (/logging|cloudtrail|audit/i.test(lower)) dimensions.add('logging')
  if (/encrypt|encryption|kms/i.test(lower)) dimensions.add('encryption')

  return [...dimensions]
}

function deriveEnforceableConditions(dimensions: string[]) {
  const conditions: string[] = []

  if (dimensions.includes('public_exposure')) {
    conditions.push('internal resources must not expose public IPs or public access')
  }
  if (dimensions.includes('network_segmentation')) {
    conditions.push('public and private network resources must be separated')
  }
  if (dimensions.includes('routing_topology')) {
    conditions.push('routing must enforce intended public and private network topology')
  }
  if (dimensions.includes('access_control')) {
    conditions.push('network or identity access controls must restrict unintended access')
  }
  if (dimensions.includes('encryption')) {
    conditions.push('relevant resources must have encryption enabled')
  }
  if (dimensions.includes('logging')) {
    conditions.push('relevant resources must have logging enabled')
  }
  if (dimensions.includes('backup_retention')) {
    conditions.push('relevant resources must have backup or retention settings configured')
  }

  return conditions
}

function deriveAllowedEvidenceFields(checkDimensions: string[]) {
  return [...new Set(checkDimensions.flatMap((dimension) => DIMENSION_TO_ALLOWED_EVIDENCE[dimension] || []))]
}

function deriveForbiddenInferredEvidence(checkDimensions: string[]) {
  return [...new Set(checkDimensions.flatMap((dimension) => DIMENSION_TO_FORBIDDEN_EVIDENCE[dimension] || []))]
}

function deriveRequiredResourceFamilies(checkDimensions: string[], resourceCandidates: string[]) {
  const families = checkDimensions.flatMap((dimension) => DIMENSION_TO_REQUIRED_RESOURCE_FAMILIES[dimension] || [])
  const deduped: string[][] = []
  const seen = new Set<string>()
  const candidateSet = new Set(resourceCandidates)

  for (const family of families) {
    if (resourceCandidates.length > 0 && family.every((resourceType) => !candidateSet.has(resourceType))) {
      continue
    }

    const normalizedFamily = [...new Set(family)].sort()
    const key = normalizedFamily.join('::')
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(normalizedFamily)
  }

  return deduped
}

function collectNonEnforceableConditions(text: string) {
  return NON_ENFORCEABLE_CONDITION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label)
}

function classifyTerraformApplicability(
  resourceCandidates: string[],
  enforceableConditions: string[],
  nonEnforceableConditions: string[],
): { terraformApplicability: TerraformApplicability; coverageMode: CoverageMode } {
  if (resourceCandidates.length === 0 && enforceableConditions.length === 0) {
    return { terraformApplicability: 'no', coverageMode: 'partial' }
  }

  if (nonEnforceableConditions.length > 0 || enforceableConditions.length === 0) {
    return { terraformApplicability: 'partial', coverageMode: 'partial' }
  }

  return { terraformApplicability: 'yes', coverageMode: 'full' }
}

function compactJsonValue(value: JsonValue): JsonValue | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => compactJsonValue(item))
      .filter((item): item is JsonValue => item !== undefined)
    return normalized.length > 0 ? normalized : undefined
  }

  if (isPlainObject(value)) {
    const normalized = compactJsonObject(value)
    return Object.keys(normalized).length > 0 ? normalized : undefined
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  return value === null ? undefined : value
}

function compactJsonObject(value: JsonObject) {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const normalized = compactJsonValue(child)
      return normalized === undefined ? [] : [[key, normalized]]
    }),
  ) as JsonObject
}

function buildNormalizedControl(
  sourcePolicy: SourcePolicyItem,
  baselineDraft: ResolvedPolicyDraft,
  signals: ExtractedPolicySignals,
): NormalizedControl {
  const sections = extractPolicySections(sourcePolicy)
  const summarySentence = pickSummarySentence(sourcePolicy.content)
  const combinedText = [
    sourcePolicy.sourcePolicyTitle,
    sections.purpose,
    sections.inspectionCriteria,
    sections.risk,
    sections.remediation,
    sections.excerpt,
  ]
    .filter(Boolean)
    .join('\n')
  const resourceCandidates =
    signals.candidateResourceTypes.length > 0
      ? signals.candidateResourceTypes
      : [...new Set(findResourceTypes(baselineDraft.definition))]
  const checkDimensions = deriveCheckDimensions(combinedText, signals.matchedTopics)
  const enforceableConditions = deriveEnforceableConditions(checkDimensions)
  const nonEnforceableConditions = collectNonEnforceableConditions(combinedText)
  const allowedEvidenceFields = deriveAllowedEvidenceFields(checkDimensions)
  const forbiddenInferredEvidence = deriveForbiddenInferredEvidence(checkDimensions)
  const requiredResourceFamilies = deriveRequiredResourceFamilies(checkDimensions, resourceCandidates)
  const { terraformApplicability, coverageMode } = classifyTerraformApplicability(
    resourceCandidates,
    enforceableConditions,
    nonEnforceableConditions,
  )

  return {
    control_id: sourcePolicy.sourcePolicyId,
    title: sourcePolicy.sourcePolicyTitle,
    source_severity: baselineDraft.severity,
    provider: baselineDraft.provider,
    target_format: 'checkov_yaml',
    terraform_applicability: terraformApplicability,
    coverage_mode: coverageMode,
    control_objective: sections.purpose || sections.inspectionCriteria || summarySentence || sourcePolicy.sourcePolicyTitle,
    pass_conditions: splitConditionSentences(sections.inspectionCriteria),
    fail_conditions: splitConditionSentences(sections.risk),
    implementation_examples: splitConditionSentences(sections.remediation),
    resource_candidates: resourceCandidates,
    check_dimensions: checkDimensions,
    enforceable_conditions: enforceableConditions,
    non_enforceable_conditions: nonEnforceableConditions,
    allowed_evidence_fields: allowedEvidenceFields,
    forbidden_inferred_evidence: forbiddenInferredEvidence,
    required_resource_families: requiredResourceFamilies,
    generation_constraints: {
      disallow_hardcoded_resource_names: true,
      must_report_uncovered_conditions: true,
      must_not_guess_missing_provider_details: true,
    },
  }
}

function buildStructuredSourcePolicyPrompt(normalizedControl: NormalizedControl) {
  return JSON.stringify(compactJsonObject(normalizedControl as unknown as JsonObject))
}

function classifySourcePolicyLocally(
  fileName: string,
  sourcePolicy: SourcePolicyItem,
): LocalPolicyClassificationResult {
  const signals = extractPolicySignals(sourcePolicy)
  const fallbackDraft = buildFallbackDraftForSourcePolicy(fileName, sourcePolicy) ?? buildBaseDraftForSourcePolicy(fileName, sourcePolicy)
  const normalizedControl = buildNormalizedControl(sourcePolicy, fallbackDraft, signals)

  if (!signals.likelyConvertible || normalizedControl.terraform_applicability === 'no') {
    return {
      convertible: false,
      reason: 'Local classifier marked this source policy as operational, procedural, or not statically checkable from Terraform.',
      signals,
      normalizedControl,
      fallbackDraft: null,
    }
  }

  if (!signals.candidateProviders.includes('aws')) {
    return {
      convertible: false,
      reason: 'Local classifier could not confirm an AWS Terraform target for this source policy.',
      signals,
      normalizedControl,
      fallbackDraft: null,
    }
  }

  return {
    convertible: true,
    reason:
      normalizedControl.coverage_mode === 'partial'
        ? 'Local classifier found Terraform-enforceable conditions, but only partial coverage is possible from static Terraform data.'
        : `Local classifier inferred Terraform AWS resource hints: ${normalizedControl.resource_candidates.join(', ')}.`,
    signals,
    normalizedControl,
    fallbackDraft,
  }
}

function buildPolicyUserPrompt(normalizedControl: NormalizedControl) {
  return [
    'Generate Terraform static-analysis policy artifacts from the following normalized control input.',
    '',
    '[CONTROL]',
    JSON.stringify(compactJsonObject(normalizedControl as unknown as JsonObject)),
    '',
    'Requirements:',
    '- target format must follow target_format',
    '- provider must follow provider',
    '- use only resource_candidates',
    '- use only allowed_evidence_fields',
    '- never use forbidden_inferred_evidence',
    '- do not hardcode Terraform resource names',
    '- report uncovered conditions when coverage_mode is partial',
    '- if sufficient grounded evidence does not exist, return cannot_generate',
    '- output JSON only',
  ].join('\n')
}

function buildRepairUserPrompt(
  normalizedControl: NormalizedControl,
  pkg: JsonObject,
  errors: string[],
) {
  return [
    'Repair the policy package using the validator errors below.',
    '',
    '[NORMALIZED_CONTROL]',
    JSON.stringify(compactJsonObject(normalizedControl as unknown as JsonObject)),
    '',
    '[PREVIOUS_OUTPUT]',
    JSON.stringify(pkg),
    '',
    '[VALIDATOR_ERRORS]',
    JSON.stringify(errors),
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

  if (/route table|routing table|aws_route|aws_route_table|internet gateway|igw|nat gateway|private subnet|public subnet|라우팅|라우트 테이블|인터넷 게이트웨이/.test(lower)) {
    matches.push(
      'aws_route',
      'aws_route_table',
      'aws_route_table_association',
      'aws_subnet',
      'aws_internet_gateway',
      'aws_nat_gateway',
    )
  }
  if (/security group|ssh|22\/tcp|0\.0\.0\.0\/0|ingress|egress|network acl|nacl/.test(lower)) {
    matches.push('aws_security_group', 'aws_network_acl')
  }
  if (/s3|bucket|public access block|versioning|server-side encryption/.test(lower)) {
    matches.push('aws_s3_bucket', 'aws_s3_bucket_public_access_block')
  }
  if (/rds|database|db instance|mysql|postgres/.test(lower)) matches.push('aws_db_instance', 'aws_rds_cluster')
  if (/ec2|instance|virtual machine|public ip|associate public ip/.test(lower)) {
    matches.push('aws_instance', 'aws_network_interface')
  }
  if (/iam|role|least privilege|trust policy/.test(lower)) matches.push('aws_iam_role')
  if (/kms|key management|customer managed key|cmk/.test(lower)) matches.push('aws_kms_key')
  if (/cloudtrail|audit trail|logging/.test(lower)) matches.push('aws_cloudtrail', 'aws_cloudwatch_log_group')
  if (/load balancer|alb|elb|tls|https listener/.test(lower)) matches.push('aws_lb', 'aws_lb_listener')
  if (/launch template|imds|metadata service|ec2/.test(lower)) matches.push('aws_launch_template')
  if (/elasticache|redis|replication group/.test(lower)) matches.push('aws_elasticache_replication_group')

  return [...new Set(matches)].slice(0, 10)
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
  const normalizedSourcePolicyId = normalizeSourcePolicyId(sourcePolicy.sourcePolicyId)

  if (!template) {
    return null
  }

  const policyName = getGeneratedPolicyName(normalizedSourcePolicyId)

  return {
    sourcePolicyId: normalizedSourcePolicyId,
    sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
    policyName,
    description:
      summarySentence ||
      `${template.description} Source: ${sourceTitle} ${normalizedSourcePolicyId}.`,
    summary: template.summary,
    policyId: getGeneratedPolicyId(normalizedSourcePolicyId),
    category: template.category,
    severity: template.severity,
    provider,
    fileName: getGeneratedPolicyFileName(normalizedSourcePolicyId),
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
  const normalizedSourcePolicyId = normalizeSourcePolicyId(sourcePolicy.sourcePolicyId)
  const policyName = getGeneratedPolicyName(normalizedSourcePolicyId)

  return {
    sourcePolicyId: normalizedSourcePolicyId,
    sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
    policyName,
    description:
      pickSummarySentence(sourcePolicy.content) ||
      `Derived from ${humanizeFileName(fileName)} ${normalizedSourcePolicyId}. Review before applying.`,
    summary: `Derived a Terraform AWS control from ${normalizedSourcePolicyId}.`,
    policyId: getGeneratedPolicyId(normalizedSourcePolicyId),
    category: 'GENERAL_SECURITY',
    severity: 'MEDIUM',
    provider,
    fileName: getGeneratedPolicyFileName(normalizedSourcePolicyId),
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

const HARDCODED_TERRAFORM_LOCAL_NAME_RE = /aws_[a-z0-9_]+\.(public|private|example|main|default)\b/i

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
}

function normalizeGeneratedPolicyPackagePolicy(value: unknown): GeneratedPolicyPackagePolicy | null {
  if (!isPlainObject(value)) {
    return null
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.file_name !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.rationale !== 'string' ||
    !Array.isArray(value.resource_types) ||
    typeof value.content !== 'string'
  ) {
    return null
  }

  return {
    id: value.id.trim(),
    file_name: value.file_name.trim(),
    title: value.title.trim(),
    rationale: value.rationale.trim(),
    resource_types: normalizeStringArray(value.resource_types),
    content: value.content.trim(),
  }
}

function normalizeGeneratedPolicyPackage(value: unknown): GeneratedPolicyPackage | null {
  if (!isPlainObject(value)) {
    return null
  }

  const status = typeof value.status === 'string' ? value.status.trim().toLowerCase() : ''
  const coverageMode = typeof value.coverage_mode === 'string' ? value.coverage_mode.trim().toLowerCase() : ''

  if ((status !== 'ok' && status !== 'cannot_generate') || (coverageMode !== 'full' && coverageMode !== 'partial')) {
    return null
  }

  return {
    status: status as GeneratedPolicyPackage['status'],
    policy_format: typeof value.policy_format === 'string' ? value.policy_format.trim() : '',
    coverage_mode: coverageMode as CoverageMode,
    policies: Array.isArray(value.policies)
      ? value.policies.map((policy) => normalizeGeneratedPolicyPackagePolicy(policy)).filter(Boolean) as GeneratedPolicyPackagePolicy[]
      : [],
    covered_conditions: normalizeStringArray(value.covered_conditions),
    not_covered_conditions: normalizeStringArray(value.not_covered_conditions),
    assumptions: normalizeStringArray(value.assumptions),
    limitations: normalizeStringArray(value.limitations),
    generation_notes: normalizeStringArray(value.generation_notes),
  }
}

function extractYamlMetadataSeverity(yamlContent: string): string {
  const lines = yamlContent.split(/\r?\n/)
  let inMetadata = false
  let metadataIndent = 0

  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length || 0
    if (!inMetadata) {
      const metadataMatch = line.match(/^(\s*)metadata:\s*$/)
      if (metadataMatch) {
        inMetadata = true
        metadataIndent = metadataMatch[1].length
      }
      continue
    }

    if (line.trim() && indent <= metadataIndent) {
      break
    }

    const severityMatch = line.match(/^\s*severity:\s*"?([A-Za-z]+)"?\s*$/)
    if (severityMatch) {
      return severityMatch[1].trim().toUpperCase()
    }
  }

  const fallbackMatch = yamlContent.match(/^\s*severity:\s*"?([A-Za-z]+)"?\s*$/m)
  return fallbackMatch ? fallbackMatch[1].trim().toUpperCase() : ''
}

function extractYamlResourceTypes(yamlContent: string): string[] {
  const lines = yamlContent.split(/\r?\n/)
  const resourceTypes: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const inlineMatch = lines[index].match(/^\s*resource_types:\s*\[(.+)\]\s*$/)
    if (inlineMatch) {
      const values = inlineMatch[1]
        .split(',')
        .map((value) => value.replace(/["']/g, '').trim())
        .filter(Boolean)
      resourceTypes.push(...values)
      continue
    }

    const blockMatch = lines[index].match(/^(\s*)resource_types:\s*$/)
    if (!blockMatch) {
      continue
    }

    const baseIndent = blockMatch[1].length
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex]
      const trimmed = nextLine.trim()
      const indent = nextLine.match(/^\s*/)?.[0].length || 0

      if (!trimmed) {
        continue
      }

      if (indent <= baseIndent) {
        break
      }

      const itemMatch = nextLine.match(/^\s*-\s*["']?([A-Za-z0-9_./-]+)["']?\s*$/)
      if (itemMatch) {
        resourceTypes.push(itemMatch[1].trim())
      }
    }
  }

  return [...new Set(resourceTypes)]
}

function containsForbiddenInventedAttrs(yamlContent: string, normalizedControl: NormalizedControl) {
  const forbiddenEvidence = new Set(normalizedControl.forbidden_inferred_evidence)
  if (![...forbiddenEvidence].some((value) => /tags/i.test(value))) {
    return false
  }

  return FORBIDDEN_INVENTED_ATTR_PATTERNS.some((pattern) => pattern.test(yamlContent))
}

function containsTautologyHint(yamlContent: string) {
  return TAUTOLOGY_PATTERNS.some((pattern) => pattern.test(yamlContent))
}

function checkRequiredResourceFamilies(policyResourceTypes: string[], normalizedControl: NormalizedControl) {
  const used = new Set(policyResourceTypes)
  const missingFamilies: string[][] = []

  for (const family of normalizedControl.required_resource_families) {
    const familySet = new Set(family)
    const overlaps = [...familySet].some((resourceType) => used.has(resourceType))
    if (!overlaps) {
      missingFamilies.push([...familySet].sort())
    }
  }

  return missingFamilies
}

function validatePolicyPackage(pkg: JsonObject, normalizedControl: NormalizedControl): string[] {
  const errors: string[] = []
  const missingKeys = REQUIRED_POLICY_PACKAGE_KEYS.filter((key) => !(key in pkg))

  if (missingKeys.length > 0) {
    errors.push(`missing keys: ${missingKeys.join(', ')}`)
  }

  const status = typeof pkg.status === 'string' ? pkg.status.trim().toLowerCase() : ''
  if (status !== 'ok' && status !== 'cannot_generate') {
    errors.push(`invalid status: ${String(pkg.status)}`)
  }

  const coverageMode = typeof pkg.coverage_mode === 'string' ? pkg.coverage_mode.trim().toLowerCase() : ''
  if (coverageMode !== 'full' && coverageMode !== 'partial') {
    errors.push(`invalid coverage_mode: ${String(pkg.coverage_mode)}`)
  }

  if (typeof pkg.policy_format !== 'string' || pkg.policy_format.trim() !== normalizedControl.target_format) {
    errors.push(`policy_format mismatch: expected=${normalizedControl.target_format}, actual=${String(pkg.policy_format)}`)
  }

  if (coverageMode === 'partial' && normalizeStringArray(pkg.not_covered_conditions).length === 0) {
    errors.push('partial coverage but not_covered_conditions is empty')
  }

  if (!Array.isArray(pkg.policies)) {
    errors.push('policies must be an array')
    return errors
  }

  if (status === 'ok' && pkg.policies.length === 0) {
    errors.push('status=ok but policies is empty')
  }

  pkg.policies.forEach((policyValue, index) => {
    if (!isPlainObject(policyValue)) {
      errors.push(`policy[${index}] must be an object`)
      return
    }

    const requiredPolicyKeys = ['id', 'file_name', 'title', 'rationale', 'resource_types', 'content']
    const missingPolicyKeys = requiredPolicyKeys.filter((key) => !(key in policyValue))
    if (missingPolicyKeys.length > 0) {
      errors.push(`policy[${index}] missing key(s): ${missingPolicyKeys.join(', ')}`)
      return
    }

    const normalizedPolicy = normalizeGeneratedPolicyPackagePolicy(policyValue)
    if (!normalizedPolicy) {
      errors.push(`policy[${index}] has invalid field types`)
      return
    }

    if (normalizedPolicy.resource_types.length === 0) {
      errors.push(`policy[${index}] resource_types is empty`)
    }

    const yamlSeverity = extractYamlMetadataSeverity(normalizedPolicy.content)
    if (!yamlSeverity) {
      errors.push(`policy[${index}] metadata.severity is missing from YAML`)
    }
    if (yamlSeverity && yamlSeverity !== normalizedControl.source_severity) {
      errors.push(`policy[${index}] severity mismatch: expected=${normalizedControl.source_severity}, actual=${yamlSeverity}`)
    }

    if (HARDCODED_TERRAFORM_LOCAL_NAME_RE.test(normalizedPolicy.content)) {
      errors.push(`policy[${index}] contains hardcoded Terraform local resource name`)
    }

    if (containsForbiddenInventedAttrs(normalizedPolicy.content, normalizedControl)) {
      errors.push(`policy[${index}] contains invented tag-based evidence forbidden by input`)
    }

    if (containsTautologyHint(normalizedPolicy.content)) {
      errors.push(`policy[${index}] contains tautology-like logic`)
    }

    const usedResourceTypes = new Set(normalizedPolicy.resource_types)
    const allowedResourceTypes = new Set(normalizedControl.resource_candidates)
    const disallowedResourceTypes = [...usedResourceTypes].filter((resourceType) => !allowedResourceTypes.has(resourceType))
    if (disallowedResourceTypes.length > 0) {
      errors.push(`policy[${index}] uses resource types outside candidates: ${disallowedResourceTypes.join(', ')}`)
    }

    const yamlResourceTypes = new Set(extractYamlResourceTypes(normalizedPolicy.content))
    if (yamlResourceTypes.size === 0) {
      errors.push(`policy[${index}] definition.resource_types is missing from YAML`)
    }
    if (yamlResourceTypes.size > 0) {
      const mismatch =
        yamlResourceTypes.size !== usedResourceTypes.size ||
        [...yamlResourceTypes].some((resourceType) => !usedResourceTypes.has(resourceType))
      if (mismatch) {
        errors.push(`policy[${index}] resource_types mismatch between top-level field and YAML definition`)
      }
    }

    const missingFamilies = checkRequiredResourceFamilies(normalizedPolicy.resource_types, normalizedControl)
    if (missingFamilies.length > 0) {
      errors.push(
        `policy[${index}] missing required resource families for dimensions ${normalizedControl.check_dimensions.join(', ')}: ${JSON.stringify(missingFamilies)}`,
      )
    }
  })

  return errors
}

function validateGeneratedDefinitionDraft(draft: JsonObject, normalizedControl: NormalizedControl) {
  const status = typeof draft.status === 'string' ? draft.status.trim().toLowerCase() : 'ok'

  if (status !== 'ok' && status !== 'cannot_generate') {
    return {
      valid: false,
      cannotGenerate: false,
      message: `Gemini returned an invalid status for ${normalizedControl.control_id}.`,
    }
  }

  if (status === 'cannot_generate') {
    return {
      valid: false,
      cannotGenerate: true,
      message: `Gemini marked ${normalizedControl.control_id} as cannot_generate from the normalized control input.`,
    }
  }

  if ('coverage_mode' in draft && typeof draft.coverage_mode === 'string') {
    const coverageMode = draft.coverage_mode.trim().toLowerCase()
    if (coverageMode !== 'full' && coverageMode !== 'partial') {
      return {
        valid: false,
        cannotGenerate: false,
        message: `Gemini returned an invalid coverage_mode for ${normalizedControl.control_id}.`,
      }
    }
  }

  if (!isPlainObject(draft.definition)) {
    return {
      valid: false,
      cannotGenerate: false,
      message: `Gemini returned JSON without a valid definition for ${normalizedControl.control_id}.`,
    }
  }

  if (!hasAwsTerraformResourceTypes(draft.definition)) {
    return {
      valid: false,
      cannotGenerate: false,
      message: `Gemini returned a definition without Terraform AWS resource_types for ${normalizedControl.control_id}.`,
    }
  }

  if (HARDCODED_TERRAFORM_LOCAL_NAME_RE.test(JSON.stringify(draft.definition))) {
    return {
      valid: false,
      cannotGenerate: false,
      message: `Gemini hardcoded Terraform local resource names for ${normalizedControl.control_id}.`,
    }
  }

  const usedResourceTypes = [...new Set(findResourceTypes(draft.definition))]
  if (normalizedControl.resource_candidates.length > 0) {
    const disallowedResourceTypes = usedResourceTypes.filter((resourceType) => !normalizedControl.resource_candidates.includes(resourceType))
    if (disallowedResourceTypes.length > 0) {
      return {
        valid: false,
        cannotGenerate: false,
        message: `Gemini used resource types outside local candidates for ${normalizedControl.control_id}: ${disallowedResourceTypes.join(', ')}.`,
      }
    }
  }

  void normalizeStringArray(draft.not_covered_conditions)
  return { valid: true, cannotGenerate: false, message: '' }
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
  const policyName = getGeneratedPolicyName(sourcePolicyId)
  const normalizedFileName = getGeneratedPolicyFileName(sourcePolicyId)
  const definition = isPlainObject(draft.definition) ? draft.definition : fallback.definition
  const policyId = getGeneratedPolicyId(sourcePolicyId)

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
  if (draft.yamlContent) {
    return `${slugify(draft.policyName)}::yaml::${draft.yamlContent}`
  }

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
const POLICY_PACKAGE_MAX_TOKENS = 2400
const POLICY_REPAIR_MAX_TOKENS = 2400

function buildPolicyClassificationSystemPrompt() {
  return [
    'You convert one extracted security policy item into one Terraform AWS Checkov policy.',
    'Return JSON only.',
    'Return the most compact valid JSON that satisfies the schema.',
    'This repository is AWS Terraform first. Do not emit Azure, GCP, Kubernetes, GitHub Actions, or generic policies that lack concrete Terraform AWS resource_types.',
    'The user input is already pre-extracted into compact sections and Terraform hints. Use that compact input instead of reconstructing the whole document.',
    'The input includes sourcePolicyId, sourcePolicyTitle, sections, and signals.',
    'sections may include purpose, inspectionCriteria, risk, remediation, and excerpt.',
    'signals may include likelyConvertible, candidateProviders, candidateResourceTypes, and matchedTopics.',
    'Treat candidateResourceTypes and matchedTopics as hints, not strict requirements.',
    'Convert the source policy directly in one pass.',
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
    'If you cannot provide a concrete Checkov definition with at least one aws_* Terraform resource_types entry, return "not_convertible".',
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
    'You are a Terraform static-analysis policy generator.',
    '',
    'You receive one compact normalized control object produced by deterministic code.',
    'You must generate policy artifacts only from the provided JSON input.',
    'Do not assume access to the original PDF, raw source text, or any unstated context.',
    '',
    'Hard rules:',
    '1. Generate policy logic from:',
    '   - control_objective',
    '   - pass_conditions',
    '   - fail_conditions',
    '   - enforceable_conditions',
    '   not from implementation_examples alone.',
    '2. Treat implementation_examples as hints, not as mandatory logic, unless explicitly stated as mandatory in the input.',
    '3. Use only resource types listed in resource_candidates.',
    '4. Use only allowed_evidence_fields.',
    '5. Never use forbidden_inferred_evidence.',
    '6. Never invent tagging schemes or classification attributes such as:',
    '   - tags.NetworkType',
    '   - tags.subnet_type',
    '   - tags.public_private',
    '   unless explicitly present in the input as allowed evidence.',
    '7. Never infer public/private separation from tags, labels, or naming conventions alone.',
    '8. For topology or segmentation controls, prefer route tables, subnet associations, routing paths, and gateway attachments over tag checks.',
    '9. Never hardcode Terraform local resource names such as:',
    '   - aws_route_table.public',
    '   - aws_nat_gateway.example',
    '   - aws_subnet.private',
    '   - aws_security_group.main',
    '10. If terraform_applicability is "partial", generate only the enforceable subset and explicitly report uncovered conditions.',
    '11. Do not convert operational, governance, approval, review-frequency, or human-process requirements into code.',
    '12. Reject tautological logic, always-true logic, and always-false logic.',
    '13. If the control requires evidence that is not available from the input, return status="cannot_generate".',
    '14. Preserve source_severity unless explicitly overridden in the input.',
    '15. Output valid JSON only. No markdown. No explanation.',
    '',
    'Return exactly this schema:',
    '{',
    '  "status": "ok | cannot_generate",',
    '  "policy_format": "string",',
    '  "coverage_mode": "full | partial",',
    '  "policies": [',
    '    {',
    '      "id": "string",',
    '      "file_name": "string",',
    '      "title": "string",',
    '      "rationale": "string",',
    '      "resource_types": ["string"],',
    '      "content": "string"',
    '    }',
    '  ],',
    '  "covered_conditions": ["string"],',
    '  "not_covered_conditions": ["string"],',
    '  "assumptions": ["string"],',
    '  "limitations": ["string"],',
    '  "generation_notes": ["string"]',
    '}',
  ].join('\n')
}

function buildPolicyRepairSystemPrompt() {
  return [
    'You are a policy-package repair engine.',
    '',
    'You receive:',
    '1. a previously generated policy package',
    '2. validator errors',
    '3. the original normalized control input',
    '',
    'Fix only the reported issues while preserving valid parts.',
    '',
    'Rules:',
    '1. Do not change the output JSON schema.',
    '2. Do not introduce hardcoded Terraform resource names.',
    '3. Do not introduce invented tag-based evidence or naming-based classification.',
    '4. Do not add policy intent beyond the normalized control input.',
    '5. If safe repair is not possible, return status="cannot_generate".',
    '6. Output valid JSON only.',
  ].join('\n')
}
void POLICY_CLASSIFICATION_ATTEMPTS
void buildPolicyClassificationSystemPrompt

function formatLlmJsonError(content: string, finishReason?: string) {
  const preview = content.replace(/\s+/g, ' ').slice(0, 220)
  if (finishReason === 'MAX_TOKENS') {
    return `Gemini response was truncated at MAX_TOKENS before valid JSON could be parsed. Preview: ${preview}`
  }

  return `Gemini returned non-JSON content. Preview: ${preview}${finishReason ? ` (finishReason: ${finishReason})` : ''}`
}

async function requestPolicyPackage(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ parsed: JsonObject | null; error?: string }> {
  const response = await callConfiguredLlm({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens,
    responseMimeType: 'application/json',
  })

  if (response === null) {
    return { parsed: null, error: 'Gemini is not configured. Set LLM_API_KEY or GEMINI_API_KEY.' }
  }

  if (!response.content) {
    return { parsed: null, error: 'Gemini returned no usable content.' }
  }

  const parsed = parseJsonValue(response.content)
  if (!isPlainObject(parsed)) {
    return { parsed: null, error: formatLlmJsonError(response.content, response.finishReason) }
  }

  return { parsed }
}

function normalizeGeneratedFileName(fileName: string, fallback: string) {
  const candidate = fileName.replace(/\\/g, '/').split('/').pop()?.trim() || fallback
  const stem = candidate.replace(/\.ya?ml$/i, '')
  return `${slugify(stem) || fallback.replace(/\.ya?ml$/i, '')}.yaml`
}

function normalizeGeneratedPolicyId(policyId: string, fallback: string) {
  const normalized = policyId.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function normalizeGeneratedYamlContent(content: string) {
  const normalized = content.replace(/\r/g, '').trim()
  if (!normalized) {
    return normalized
  }

  return normalized.startsWith('---') ? `${normalized}\n` : `---\n${normalized}\n`
}

function resolveGeneratedPolicyPackageDraft(
  sourcePolicy: SourcePolicyItem,
  policy: GeneratedPolicyPackagePolicy,
  pkg: GeneratedPolicyPackage,
  fallback: ResolvedPolicyDraft,
): ResolvedPolicyDraft {
  const notCoveredSummary =
    pkg.coverage_mode === 'partial' && pkg.not_covered_conditions.length > 0
      ? `Partial coverage. Not covered: ${pkg.not_covered_conditions.join('; ')}.`
      : fallback.summary

  return {
    sourcePolicyId: sourcePolicy.sourcePolicyId,
    sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
    policyName: policy.title || fallback.policyName,
    description: policy.rationale || fallback.description,
    summary: notCoveredSummary,
    policyId: normalizeGeneratedPolicyId(policy.id, fallback.policyId),
    category: fallback.category,
    severity: fallback.severity,
    provider: fallback.provider,
    guideline: fallback.guideline,
    fileName: normalizeGeneratedFileName(policy.file_name, fallback.fileName),
    definition: fallback.definition,
    yamlContent: normalizeGeneratedYamlContent(policy.content),
  }
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
      const localClassification = classifySourcePolicyLocally(fileName, sourcePolicy)
      if (!localClassification.convertible || !localClassification.fallbackDraft || !localClassification.normalizedControl) {
        skippedPolicies.push({
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
          reason: localClassification.reason,
        })
        continue
      }

      const initialResult = await requestPolicyPackage(
        buildPolicyDefinitionSystemPrompt(),
        buildPolicyUserPrompt(localClassification.normalizedControl),
        POLICY_PACKAGE_MAX_TOKENS,
      )

      if (!initialResult.parsed) {
        const definitionError = `${sourcePolicy.sourcePolicyId}: ${initialResult.error || 'Gemini returned no usable content.'}`
        errors.push(definitionError)
        skippedPolicies.push({
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
          reason: `Gemini could not generate a grounded policy package. ${definitionError}`,
        })
        continue
      }

      let packageCandidate = initialResult.parsed
      const initialStatus = typeof packageCandidate.status === 'string' ? packageCandidate.status.trim().toLowerCase() : ''
      if (initialStatus === 'cannot_generate') {
        skippedPolicies.push({
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
          reason: `Gemini returned cannot_generate for ${sourcePolicy.sourcePolicyId}.`,
        })
        continue
      }

      let validationErrors = validatePolicyPackage(packageCandidate, localClassification.normalizedControl)
      if (validationErrors.length > 0) {
        const repairResult = await requestPolicyPackage(
          buildPolicyRepairSystemPrompt(),
          buildRepairUserPrompt(localClassification.normalizedControl, packageCandidate, validationErrors),
          POLICY_REPAIR_MAX_TOKENS,
        )

        if (!repairResult.parsed) {
          const repairError = `${sourcePolicy.sourcePolicyId}: ${repairResult.error || 'Gemini repair returned no usable content.'}`
          errors.push(repairError)
          skippedPolicies.push({
            sourcePolicyId: sourcePolicy.sourcePolicyId,
            sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
            reason: `Validator rejected the generated package and repair failed. ${repairError}`,
          })
          continue
        }

        packageCandidate = repairResult.parsed
        const repairedStatus = typeof packageCandidate.status === 'string' ? packageCandidate.status.trim().toLowerCase() : ''
        if (repairedStatus === 'cannot_generate') {
          skippedPolicies.push({
            sourcePolicyId: sourcePolicy.sourcePolicyId,
            sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
            reason: `Repair marked ${sourcePolicy.sourcePolicyId} as cannot_generate.`,
          })
          continue
        }

        validationErrors = validatePolicyPackage(packageCandidate, localClassification.normalizedControl)
      }

      if (validationErrors.length > 0) {
        const definitionError = `${sourcePolicy.sourcePolicyId}: ${validationErrors.join(' | ')}`
        errors.push(definitionError)
        skippedPolicies.push({
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
          reason: `Validator rejected the generated package after one repair attempt. ${definitionError}`,
        })
        continue
      }

      const normalizedPackage = normalizeGeneratedPolicyPackage(packageCandidate)
      if (!normalizedPackage || normalizedPackage.status !== 'ok' || normalizedPackage.policies.length === 0) {
        const definitionError = `${sourcePolicy.sourcePolicyId}: generated package could not be normalized after validation.`
        errors.push(definitionError)
        skippedPolicies.push({
          sourcePolicyId: sourcePolicy.sourcePolicyId,
          sourcePolicyTitle: sourcePolicy.sourcePolicyTitle,
          reason: definitionError,
        })
        continue
      }

      for (const policy of normalizedPackage.policies) {
        resolvedDrafts.push(
          resolveGeneratedPolicyPackageDraft(
            sourcePolicy,
            policy,
            normalizedPackage,
            localClassification.fallbackDraft,
          ),
        )
      }
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
  const sourcePolicyMap = new Map(sourcePolicies.map((sourcePolicy) => [sourcePolicy.sourcePolicyId, sourcePolicy]))
  const llmResult = await generateWithLlm(input.fileName, sourcePolicies)
  const resolvedDrafts = llmResult?.drafts || []
  const policies = resolvedDrafts.map((draft) => ({
    sourcePolicyId: draft.sourcePolicyId,
    sourcePolicyTitle: draft.sourcePolicyTitle,
    sourceExcerpt: sourcePolicyMap.get(draft.sourcePolicyId)?.content,
    policyName: draft.policyName,
    description: draft.description,
    summary: draft.summary,
    category: draft.category,
    severity: draft.severity,
    targetProvider: draft.provider,
    policyId: draft.policyId,
    policyPath: `security/checkov/custom_policies/${draft.fileName}`,
    yaml: draft.yamlContent || buildCustomPolicyYaml(draft),
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
