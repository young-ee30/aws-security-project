/** 관제·침해 로그 페이지용 더미 데이터 (실연동 전 시각화 목적) */

export type TelemetrySource = 'cloudwatch' | 'prometheus' | 'cloudtrail'

export interface MonitoringSummaryCard {
  id: string
  title: string
  value: string
  sub?: string
  source: TelemetrySource
}

export interface MonitoringLogLine {
  id: string
  time: string
  message: string
  level: 'info' | 'warn' | 'error'
  source: TelemetrySource
}

export interface IncidentLogLine {
  id: string
  time: string
  event: string
  actor: string
  severity: 'low' | 'medium' | 'high'
  source: TelemetrySource
}

/** 관제측면 — 요약 KPI (다양한 메트릭) */
export const monitoringSummaryCards: MonitoringSummaryCard[] = [
  { id: 'k1', title: 'ALB Healthy / 총 타깃', value: '8 / 8', sub: 'ap-northeast-2', source: 'cloudwatch' },
  { id: 'k2', title: '평균 RPS (5m)', value: '118', sub: 'api-node 서비스', source: 'prometheus' },
  { id: 'k3', title: 'ECS CPUUtilization', value: '41%', sub: '클러스터 평균', source: 'cloudwatch' },
  { id: 'k4', title: 'ECS MemoryUtilization', value: '62%', sub: '태스크 평균', source: 'cloudwatch' },
  { id: 'k5', title: 'ALB TargetResponseTime p99', value: '186 ms', sub: '지연 상위 1%', source: 'cloudwatch' },
  { id: 'k6', title: 'ALB TargetResponseTime p95', value: '112 ms', sub: '지연 상위 5%', source: 'cloudwatch' },
  { id: 'k7', title: 'HTTP 서버 지연 p50', value: '38 ms', sub: 'Prometheus histogram', source: 'prometheus' },
  { id: 'k8', title: '초당 요청 (피크)', value: '214 /s', sub: '지난 1h 최대', source: 'prometheus' },
  { id: 'k9', title: 'RDS CPUUtilization', value: '28%', sub: 'db.t3.medium', source: 'cloudwatch' },
  { id: 'k10', title: 'RDS DatabaseConnections', value: '34', sub: 'max 80', source: 'cloudwatch' },
  { id: 'k11', title: 'ALB HTTP 4xx (1h)', value: '1.2k', sub: '클라이언트 오류', source: 'cloudwatch' },
  { id: 'k12', title: 'ALB HTTP 5xx (1h)', value: '14', sub: '서버 오류', source: 'cloudwatch' },
  { id: 'k13', title: 'Node.js 힙 사용', value: '412 MB', sub: 'heap used / 512MB limit', source: 'prometheus' },
  { id: 'k14', title: 'GC pause (p99)', value: '42 ms', sub: 'V8 minor GC', source: 'prometheus' },
  { id: 'k15', title: 'NAT Gateway BytesOut', value: '2.4 GB/h', sub: 'egress', source: 'cloudwatch' },
  { id: 'k16', title: 'EBS ReadThroughput', value: '18 MB/s', sub: '볼륨 vol-0abc…', source: 'cloudwatch' },
]

const T0 = 10
/** 관제측면 — 처리량·ECS CPU */
export const monitoringRpsTrend = Array.from({ length: 24 }, (_, i) => ({
  t: `${T0 + Math.floor(i / 2)}:${(i % 2) * 30 === 0 ? '00' : '30'}`,
  rps: 90 + Math.sin(i / 3) * 35 + Math.random() * 15,
  cpu: 30 + Math.cos(i / 4) * 18 + Math.random() * 8,
}))

/** 관제측면 — 지연 (ms) p50 / p95 / p99 */
export const monitoringLatencyTrend = Array.from({ length: 24 }, (_, i) => ({
  t: monitoringRpsTrend[i].t,
  p50: 28 + Math.sin(i / 2) * 12 + Math.random() * 6,
  p95: 85 + Math.sin(i / 2.5) * 35 + Math.random() * 20,
  p99: 140 + Math.sin(i / 2) * 55 + Math.random() * 30,
}))

/** 관제측면 — 메모리% · JVM heap 비율 */
export const monitoringMemoryTrend = Array.from({ length: 24 }, (_, i) => ({
  t: monitoringRpsTrend[i].t,
  ecsMem: 52 + Math.cos(i / 3) * 12 + Math.random() * 5,
  heapPct: 58 + Math.sin(i / 4) * 15 + Math.random() * 4,
}))

/** 관제측면 — ALB 4xx/5xx (엔드포인트별 샘플) */
export const monitoringErrorByRoute = [
  { route: '/api/orders', x4: 420, x5: 2, source: 'cloudwatch' as TelemetrySource },
  { route: '/api/users', x4: 310, x5: 0, source: 'cloudwatch' },
  { route: '/api/auth', x4: 890, x5: 8, source: 'cloudwatch' },
  { route: '/api/products', x4: 120, x5: 1, source: 'cloudwatch' },
  { route: '/health', x4: 12, x5: 0, source: 'prometheus' },
  { route: '/api/search', x4: 210, x5: 3, source: 'cloudwatch' },
]

/** 관제측면 — 최근 로그/이벤트 (대량) */
export const monitoringLogLines: MonitoringLogLine[] = [
  { id: 'm01', time: '2025-03-21 14:06:22', message: '[CW] ECS 서비스 api-node desired=2 running=2 안정', level: 'info', source: 'cloudwatch' },
  { id: 'm02', time: '2025-03-21 14:05:58', message: '[Prometheus] process_resident_memory_bytes 512MiB 근접', level: 'warn', source: 'prometheus' },
  { id: 'm03', time: '2025-03-21 14:05:11', message: '[CW] ALB UnHealthyHostCount = 0', level: 'info', source: 'cloudwatch' },
  { id: 'm04', time: '2025-03-21 14:04:33', message: '[CW Alarm] RDS FreeableMemory OK (80MB 이상)', level: 'info', source: 'cloudwatch' },
  { id: 'm05', time: '2025-03-21 14:03:47', message: '[Prometheus] http_request_duration_seconds_bucket p99 0.19s', level: 'info', source: 'prometheus' },
  { id: 'm06', time: '2025-03-21 14:03:02', message: '[CW Logs] api-node 컨테이너 stdout — GET /api/health 200', level: 'info', source: 'cloudwatch' },
  { id: 'm07', time: '2025-03-21 14:02:11', message: '[CW Alarm] RDS cpu-utilization OK → 임계값 이하로 복구', level: 'info', source: 'cloudwatch' },
  { id: 'm08', time: '2025-03-21 14:01:55', message: '[Prometheus] nodejs_eventloop_lag_seconds 0.012 (정상)', level: 'info', source: 'prometheus' },
  { id: 'm09', time: '2025-03-21 14:01:03', message: '[Prometheus] http_server_requests_seconds_count 급증 구간 샘플링', level: 'info', source: 'prometheus' },
  { id: 'm10', time: '2025-03-21 14:00:18', message: '[CW] ApplicationELB RequestCountPerTarget 증가 (트래픽 정오 피크)', level: 'info', source: 'cloudwatch' },
  { id: 'm11', time: '2025-03-21 13:59:40', message: '[CW] TargetResponseTime 평균 64ms', level: 'info', source: 'cloudwatch' },
  { id: 'm12', time: '2025-03-21 13:58:44', message: '[CW Logs] ECS api-node — 헬스체크 200 유지', level: 'info', source: 'cloudwatch' },
  { id: 'm13', time: '2025-03-21 13:57:30', message: '[Prometheus] jvm_memory_used_bytes heap 68%', level: 'warn', source: 'prometheus' },
  { id: 'm14', time: '2025-03-21 13:56:12', message: '[CW] RDS ReadLatency 2.1ms / WriteLatency 4.8ms', level: 'info', source: 'cloudwatch' },
  { id: 'm15', time: '2025-03-21 13:55:22', message: '[Prometheus] Node.js heap 사용률 68% (주의 임계 근접)', level: 'warn', source: 'prometheus' },
  { id: 'm16', time: '2025-03-21 13:54:01', message: '[CW] ALB TargetResponseTime p95 120ms', level: 'info', source: 'cloudwatch' },
  { id: 'm17', time: '2025-03-21 13:53:18', message: '[CW] NetworkPacketsOut 급증 없음', level: 'info', source: 'cloudwatch' },
  { id: 'm18', time: '2025-03-21 13:52:44', message: '[Prometheus] process_open_fds 124 / 65535', level: 'info', source: 'prometheus' },
  { id: 'm19', time: '2025-03-21 13:51:09', message: '[CW] EBS VolumeQueueLength 0.02 (양호)', level: 'info', source: 'cloudwatch' },
  { id: 'm20', time: '2025-03-21 13:50:33', message: '[CW Logs] frontend 스트림 — 정적 리소스 캐시 HIT 비율 92%', level: 'info', source: 'cloudwatch' },
  { id: 'm21', time: '2025-03-21 13:49:11', message: '[Prometheus] api_errors_total{code="500"} 2건/5m', level: 'warn', source: 'prometheus' },
  { id: 'm22', time: '2025-03-21 13:48:02', message: '[CW] AutoScaling Group — desired capacity 변경 없음', level: 'info', source: 'cloudwatch' },
  { id: 'm23', time: '2025-03-21 13:46:55', message: '[Prometheus] grpc_server_handled_total latency histogram flush', level: 'info', source: 'prometheus' },
  { id: 'm24', time: '2025-03-21 13:45:20', message: '[CW] NAT Gateway ActiveConnectionCount 1.8k', level: 'info', source: 'cloudwatch' },
  { id: 'm25', time: '2025-03-21 13:44:08', message: '[CW] Lambda Duration p99 820ms (샘플 함수)', level: 'info', source: 'cloudwatch' },
  { id: 'm26', time: '2025-03-21 13:42:51', message: '[Prometheus] db_client_query_duration avg 14ms', level: 'info', source: 'prometheus' },
  { id: 'm27', time: '2025-03-21 13:41:17', message: '[CW] RDS ReplicaLag 0.3s (읽기 복제본)', level: 'warn', source: 'cloudwatch' },
  { id: 'm28', time: '2025-03-21 13:39:44', message: '[CW] ALB ConsumedLCUs 2.4 (과금 단위)', level: 'info', source: 'cloudwatch' },
  { id: 'm29', time: '2025-03-21 13:38:01', message: '[Prometheus] socket_connections 1.2k ESTABLISHED', level: 'info', source: 'prometheus' },
  { id: 'm30', time: '2025-03-21 13:36:22', message: '[CW] ECS Deployment circuit — PRIMARY 완료', level: 'info', source: 'cloudwatch' },
  { id: 'm31', time: '2025-03-21 13:34:50', message: '[CW Logs] api-python 스트림 — uvicorn access log 샘플', level: 'info', source: 'cloudwatch' },
  { id: 'm32', time: '2025-03-21 13:33:11', message: '[Prometheus] rate(http_requests_total[5m]) min 92 max 201', level: 'info', source: 'prometheus' },
  { id: 'm33', time: '2025-03-21 13:31:08', message: '[CW] ELB 5xx 비율 0.08% (임계 미만)', level: 'info', source: 'cloudwatch' },
  { id: 'm34', time: '2025-03-21 13:29:33', message: '[CW] DiskSpaceUtilization /data 61%', level: 'warn', source: 'cloudwatch' },
  { id: 'm35', time: '2025-03-21 13:27:44', message: '[Prometheus] scrape_duration_seconds 0.04s (exporter)', level: 'info', source: 'prometheus' },
  { id: 'm36', time: '2025-03-21 13:25:19', message: '[CW] SQS ApproximateNumberOfMessagesVisible 0', level: 'info', source: 'cloudwatch' },
  { id: 'm37', time: '2025-03-21 13:23:02', message: '[Prometheus] cache_hit_ratio 0.94 (Redis)', level: 'info', source: 'prometheus' },
  { id: 'm38', time: '2025-03-21 13:20:51', message: '[CW] CloudFront 4xxErrorRate 0.2% (엣지)', level: 'info', source: 'cloudwatch' },
  { id: 'm39', time: '2025-03-21 13:18:14', message: '[CW] ECS TaskPlacementFailure 없음', level: 'info', source: 'cloudwatch' },
  { id: 'm40', time: '2025-03-21 13:15:00', message: '[Prometheus] ALERT FORWARDING — 규칙 그룹 prod-http eval 30s', level: 'info', source: 'prometheus' },
  { id: 'm41', time: '2025-03-21 13:12:33', message: '[CW] ThrottledRequests DynamoDB 0', level: 'info', source: 'cloudwatch' },
  { id: 'm42', time: '2025-03-21 13:10:07', message: '[CW] ELB SpilloverCount 0', level: 'info', source: 'cloudwatch' },
  { id: 'm43', time: '2025-03-21 13:07:41', message: '[Prometheus] db_pool_waiting 0 / active 12', level: 'info', source: 'prometheus' },
  { id: 'm44', time: '2025-03-21 13:05:18', message: '[CW] RDS DiskQueueDepth 0.1', level: 'info', source: 'cloudwatch' },
  { id: 'm45', time: '2025-03-21 13:02:55', message: '[ERROR][CW Logs] api-node 한 건 타임아웃 스택 (샘플)', level: 'error', source: 'cloudwatch' },
]

/** 침해사고 측면 — 요약 KPI */
export const incidentSummaryCards: MonitoringSummaryCard[] = [
  { id: 'i1', title: 'CloudTrail (1h)', value: '42건', sub: '관리 이벤트', source: 'cloudtrail' },
  { id: 'i2', title: 'CloudTrail (24h)', value: '1.02k건', sub: 'Read/Write API', source: 'cloudtrail' },
  { id: 'i3', title: 'WAF 차단 (24h)', value: '128', sub: 'RateLimit + CRS', source: 'cloudwatch' },
  { id: 'i4', title: 'GuardDuty Findings (7d)', value: '6', sub: '중간 이상 2건', source: 'cloudwatch' },
  { id: 'i5', title: 'Root 계정 사용', value: '0건', sub: '감지 없음', source: 'cloudtrail' },
  { id: 'i6', title: 'IAM 정책 변경 (24h)', value: '3건', sub: '감사 필요', source: 'cloudtrail' },
  { id: 'i7', title: '비정상 5xx 비율', value: '0.12%', sub: 'Prometheus / ALB', source: 'prometheus' },
  { id: 'i8', title: '실패한 콘솔 로그인', value: '7건', sub: 'CloudTrail (샘플)', source: 'cloudtrail' },
  { id: 'i9', title: 'S3 퍼블릭 ACL 시도', value: '0건', sub: '차단 정책', source: 'cloudtrail' },
  { id: 'i10', title: '보안 그룹 인바운드 변경', value: '2건', sub: 'Change 관리', source: 'cloudtrail' },
  { id: 'i11', title: 'KMS Decrypt 실패', value: '1건', sub: '키 정책 점검', source: 'cloudtrail' },
  { id: 'i12', title: 'STS AssumeRole 급증', value: 'Δ +18%', sub: '전일 대비', source: 'cloudtrail' },
]

/** 침해사고 측면 — 이벤트 테이블 (대량) */
export const incidentLogLines: IncidentLogLine[] = [
  { id: 'x01', time: '2025-03-21 14:05:11', event: 'AssumeRole', actor: 'ci-deploy → role/DeployRole', severity: 'low', source: 'cloudtrail' },
  { id: 'x02', time: '2025-03-21 14:03:02', event: 'CreateLoginProfile', actor: 'root', severity: 'high', source: 'cloudtrail' },
  { id: 'x03', time: '2025-03-21 14:01:44', event: 'AuthorizeSecurityGroupIngress', actor: 'admin-role', severity: 'medium', source: 'cloudtrail' },
  { id: 'x04', time: '2025-03-21 13:59:18', event: 'PutBucketPolicy', actor: 'terraform-runner', severity: 'medium', source: 'cloudtrail' },
  { id: 'x05', time: '2025-03-21 13:57:33', event: 'DeleteTrail', actor: 'unknown-session', severity: 'high', source: 'cloudtrail' },
  { id: 'x06', time: '2025-03-21 13:55:01', event: 'GetObject', actor: 'app-readonly → bucket/config', severity: 'low', source: 'cloudtrail' },
  { id: 'x07', time: '2025-03-21 13:52:40', event: 'WAF BlockedRequest', actor: '185.x.x.x / SQLi 시그니처', severity: 'medium', source: 'cloudwatch' },
  { id: 'x08', time: '2025-03-21 13:50:12', event: 'ConsoleLogin Failure', actor: 'MFA 미설정 사용자', severity: 'medium', source: 'cloudtrail' },
  { id: 'x09', time: '2025-03-21 13:48:55', event: 'GetObject (S3)', actor: 'assumed-role/app/*', severity: 'low', source: 'cloudtrail' },
  { id: 'x10', time: '2025-03-21 13:46:20', event: 'http_5xx_spike', actor: 'tg-api-node', severity: 'high', source: 'prometheus' },
  { id: 'x11', time: '2025-03-21 13:44:51', event: 'RunInstances', actor: 'autoscaling-role', severity: 'low', source: 'cloudtrail' },
  { id: 'x12', time: '2025-03-21 13:42:18', event: 'AttachUserPolicy', actor: 'IAMAdmin', severity: 'high', source: 'cloudtrail' },
  { id: 'x13', time: '2025-03-21 13:40:11', event: 'WAF RateLimit', actor: '103.x.x.x → CF', severity: 'medium', source: 'cloudwatch' },
  { id: 'x14', time: '2025-03-21 13:38:44', event: 'Decrypt (KMS)', actor: 'lambda-exec-role 실패', severity: 'medium', source: 'cloudtrail' },
  { id: 'x15', time: '2025-03-21 13:36:09', event: 'Network ACL 변경', actor: 'netadmin', severity: 'medium', source: 'cloudtrail' },
  { id: 'x16', time: '2025-03-21 13:33:55', event: 'GuardDuty: Backdoor:EC2', actor: 'i-0fake…', severity: 'high', source: 'cloudwatch' },
  { id: 'x17', time: '2025-03-21 13:31:22', event: 'PasswordRecoveryRequested', actor: 'user@corp.com', severity: 'low', source: 'cloudtrail' },
  { id: 'x18', time: '2025-03-21 13:28:17', event: '403 비율 급증', actor: '/api/admin/*', severity: 'medium', source: 'prometheus' },
  { id: 'x19', time: '2025-03-21 13:25:00', event: 'StopLogging', actor: 'auditor-role', severity: 'high', source: 'cloudtrail' },
  { id: 'x20', time: '2025-03-21 13:22:33', event: 'PutSecretValue', actor: 'secrets-manager CI', severity: 'low', source: 'cloudtrail' },
  { id: 'x21', time: '2025-03-21 13:19:48', event: 'WAF GeoMatch', actor: 'CN → Block', severity: 'medium', source: 'cloudwatch' },
  { id: 'x22', time: '2025-03-21 13:17:11', event: 'RevokeSecurityGroupEgress', actor: '긴급 롤백', severity: 'high', source: 'cloudtrail' },
  { id: 'x23', time: '2025-03-21 13:14:02', event: 'Discovery:IAMUser', actor: 'GuardDuty', severity: 'medium', source: 'cloudwatch' },
  { id: 'x24', time: '2025-03-21 13:10:51', event: 'ListBuckets', actor: '외부 IP 스캔 의심', severity: 'medium', source: 'cloudtrail' },
  { id: 'x25', time: '2025-03-21 13:07:30', event: 'Unauthorized 401 burst', actor: '/api/auth/token', severity: 'medium', source: 'prometheus' },
]
