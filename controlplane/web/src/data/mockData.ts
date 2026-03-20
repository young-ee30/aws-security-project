export type TrendDirection = 'up' | 'down'
export type PipelineStatus = 'success' | 'failed' | 'running'
export type PolicyStatus = 'active' | 'draft' | 'paused'

export interface PolicyTemplate {
  id: string
  name: string
  description: string
  source: string
  checks: number
  status: PolicyStatus
  lastUpdated: string
  yaml: string
}

// 앱/HTTP 모니터링 데이터
export const rpsData: Array<{ endpoint: string; rps: number; trend: TrendDirection }> = [
  { endpoint: '/api/users', rps: 110.6, trend: 'up' },
  { endpoint: '/api/orders', rps: 62.3, trend: 'down' },
  { endpoint: '/api/auth', rps: 36.3, trend: 'down' },
  { endpoint: '/api/products', rps: 191, trend: 'down' },
  { endpoint: '/api/search', rps: 50.4, trend: 'up' },
]

export const requestTrendData = Array.from({ length: 30 }, (_, i) => ({
  time: `${i}m`,
  users: 100 + Math.random() * 160,
  orders: 60 + Math.random() * 80,
  auth: 20 + Math.random() * 50,
  products: 140 + Math.random() * 100,
  search: 80 + Math.random() * 60,
}))

export const errorBarData = [
  { endpoint: 'users', '4xx': 28, '5xx': 8 },
  { endpoint: 'orders', '4xx': 18, '5xx': 12 },
  { endpoint: 'auth', '4xx': 32, '5xx': 18 },
  { endpoint: 'products', '4xx': 15, '5xx': 20 },
  { endpoint: 'search', '4xx': 12, '5xx': 15 },
]

export const errorRateData = [
  { endpoint: '/api/users', '4xx': 32, '5xx': 4, rate: '0.54%' },
  { endpoint: '/api/orders', '4xx': 25, '5xx': 4, rate: '0.78%' },
  { endpoint: '/api/auth', '4xx': 36, '5xx': 10, rate: '2.11%' },
  { endpoint: '/api/products', '4xx': 19, '5xx': 7, rate: '0.23%' },
  { endpoint: '/api/search', '4xx': 19, '5xx': 10, rate: '0.96%' },
]

// 인프라 모니터링 데이터
export const cpuCoreData = [
  { core: 'core0', user: 45, system: 12, iowait: 3 },
  { core: 'core1', user: 38, system: 15, iowait: 5 },
  { core: 'core2', user: 52, system: 18, iowait: 2 },
  { core: 'core3', user: 35, system: 10, iowait: 8 },
  { core: 'core4', user: 42, system: 20, iowait: 4 },
  { core: 'core5', user: 48, system: 14, iowait: 6 },
  { core: 'core6', user: 30, system: 16, iowait: 4 },
  { core: 'core7', user: 40, system: 12, iowait: 5 },
]

export const ioWaitData = Array.from({ length: 30 }, (_, i) => ({
  time: `${16 + Math.floor(i / 2)}m`,
  value: 5 + Math.random() * 25,
}))

export const memoryData = {
  used: 18.2,
  cache: 7.2,
  buffer: 1.8,
  free: 4.8,
  total: 32
}

export const memoryTrendData = Array.from({ length: 30 }, (_, i) => ({
  time: `${16 + Math.floor(i / 2)}m`,
  value: 55 + Math.random() * 30,
}))

export const diskData = [
  { mount: '/ (root)', used: 39, total: 100, percentage: 39 },
  { mount: '/data', used: 1232, total: 2000, percentage: 62 },
]

export const diskIOData = Array.from({ length: 30 }, (_, i) => ({
  time: `${i}m`,
  read: 200 + Math.random() * 400,
  write: 150 + Math.random() * 300,
}))

// AWS 리소스 모니터링 데이터
export const ec2Info = {
  id: 'i-0a1b2c3d',
  type: 't3.medium',
  region: 'ap-northeast-2a',
  status: 'running'
}

export const cpuUsageData = Array.from({ length: 30 }, (_, i) => ({
  time: `${i}m`,
  value: 30 + Math.random() * 40,
}))

export const networkData = Array.from({ length: 30 }, (_, i) => ({
  time: `${i}m`,
  in: 100 + Math.random() * 300,
  out: 80 + Math.random() * 200,
}))

export const rdsInfo = {
  readLatency: 7.7,
  writeLatency: 12.2,
  activeConnections: 390,
  maxConnections: 500,
  engine: 'MySQL 8.0.35',
  multiAZ: true,
  autoBackup: '7일 보존'
}

export const rdsLatencyData = Array.from({ length: 30 }, (_, i) => ({
  time: `${i}m`,
  read: 5 + Math.random() * 15,
  write: 8 + Math.random() * 18,
}))

export const rdsConnectionData = Array.from({ length: 30 }, (_, i) => ({
  time: `${i}m`,
  value: 300 + Math.random() * 200,
}))

// CI/CD 및 Git Actions 데이터
export const pipelineData: Array<{
  id: string
  name: string
  status: PipelineStatus
  description: string
  branch: string
  commit: string
  duration: string
  time: string
  author: string
}> = [
    {
      id: '1',
      name: 'CI — Build & Test',
      status: 'failed',
      description: 'feat: 사용자 인증 모듈 리팩토링',
      branch: 'main',
      commit: 'a3f8c21',
      duration: '3m 42s',
      time: '5분 전',
      author: '@kim-dev'
    },
    {
      id: '2',
      name: 'Security Scan — Trivy',
      status: 'failed',
      description: 'feat: 사용자 인증 모듈 리팩토링',
      branch: 'main',
      commit: 'a3f8c21',
      duration: '2m 15s',
      time: '5분 전',
      author: '@kim-dev'
    },
    {
      id: '3',
      name: 'CD — Deploy to Staging',
      status: 'success',
      description: 'chore: 2.5.0 스테이징 배포',
      branch: 'release/2.5.0',
      commit: 'b7d1e94',
      duration: '4m 28s',
      time: '23분 전',
      author: '@ci-bot'
    },
    {
      id: '4',
      name: 'CD — Deploy to Production',
      status: 'failed',
      description: 'release: v2.4.1',
      branch: 'main',
      commit: 'c9e2f05',
      duration: '5m 11s',
      time: '1시간 전',
      author: '@lee-ops'
    }
  ]

export const securityScanLog = {
  title: 'Security Scan — Trivy',
  status: 'failed',
  description: 'feat: 사용자 인증 모듈 리팩토링',
  branch: 'main',
  commit: 'a3f8c21',
  duration: '2m 15s',
  author: '@kim-dev',
  steps: [
    {
      name: '보안 스캔',
      duration: '2m 15s',
      status: 'running'
    },
    {
      name: 'Docker 이미지 빌드',
      duration: '1m 30s',
      status: 'failed',
      logs: [
        { type: 'info', text: 'Building Docker image...' },
        { type: 'error', text: 'Step 4/8 : COPY ./src /app/src' },
        { type: 'error', text: 'COPY failed: file not found: stat src: file does not exist' },
        { type: 'error', text: 'Error: Process completed with exit code 1.' }
      ]
    },
    {
      name: 'Trivy 보안 스캔',
      duration: '45s',
      status: 'failed',
      logs: [
        { type: 'info', text: 'Downloading Trivy DB...' },
        { type: 'critical', text: 'CRITICAL: lodash@4.17.15 (CVE-2021-23337) - Prototype Pollution' },
        { type: 'critical', text: 'CRITICAL: express@4.17.1 (CVE-2022-24999) - Open Redirect' },
        { type: 'high', text: 'HIGH: axios@0.21.1 (CVE-2021-3749) - ReDoS' },
        { type: 'info', text: '' },
        { type: 'error', text: 'Total: 2 CRITICAL, 5 HIGH' },
        { type: 'error', text: 'Error: Process completed with exit code 1' }
      ]
    }
  ]
}

export const policySummary = [
  { label: '등록 정책', value: 3, tone: 'blue' },
  { label: '활성 정책', value: 2, tone: 'green' },
  { label: '총 검사 규칙', value: 238, tone: 'slate' },
]

export const policyTemplates: PolicyTemplate[] = [
  {
    id: 'policy-1',
    name: 'CIS AWS Benchmark v1.4',
    description: 'AWS 계정과 네트워크 리소스를 CIS 기준으로 점검하는 정책입니다.',
    source: 'CIS_AWS_Benchmark_v1.4.pdf',
    checks: 128,
    status: 'active',
    lastUpdated: '10분 전',
    yaml: `name: "cis-aws-benchmark"
on:
  pull_request:
  push:
    branches: [main]

jobs:
  checkov:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bridgecrewio/checkov-action@master
        with:
          framework: terraform,cloudformation
          check: CKV_AWS_2,CKV_AWS_8,CKV_AWS_18
`,
  },
  {
    id: 'policy-2',
    name: 'OWASP Top 10 IaC',
    description: '애플리케이션 배포 전에 주요 IaC 취약 구성을 우선 탐지하는 정책입니다.',
    source: 'OWASP_Top10_IaC.pdf',
    checks: 47,
    status: 'active',
    lastUpdated: '2시간 전',
    yaml: `name: "owasp-top10-iac"
on:
  workflow_dispatch:
  pull_request:

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bridgecrewio/checkov-action@master
        with:
          framework: kubernetes,terraform
          soft_fail: false
`,
  },
  {
    id: 'policy-3',
    name: 'KISA 클라우드 보안 가이드',
    description: '클라우드 운영 환경의 기본 보안 통제 항목을 점검하는 정책입니다.',
    source: 'KISA_Cloud_Security.pdf',
    checks: 63,
    status: 'draft',
    lastUpdated: '대기 중',
    yaml: `name: "kisa-cloud-security"
on:
  pull_request:

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: checkov -d . --framework terraform --output cli
`,
  },
]
