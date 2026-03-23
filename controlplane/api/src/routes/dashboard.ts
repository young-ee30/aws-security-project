import { Router, Request, Response } from 'express'
import {
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import {
  GetMetricDataCommand,
  DescribeAlarmsCommand,
  MetricDataQuery,
} from '@aws-sdk/client-cloudwatch'
import { LookupEventsCommand } from '@aws-sdk/client-cloudtrail'
import {
  ListDetectorsCommand,
  ListFindingsCommand,
  GetFindingsCommand,
} from '@aws-sdk/client-guardduty'
import {
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2'
import {
  DescribeServicesCommand,
  ListTasksCommand,
  DescribeTasksCommand,
  Task,
} from '@aws-sdk/client-ecs'
import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds'

import { env } from '../config/env.js'
import {
  logsClient,
  cwClient,
  cwUsEast1,
  trailClient,
  gdClient,
  elbClient,
  ecsClient,
  rdsApiClient,
} from '../aws/clients.js'

// ── 상수 ──────────────────────────────────────────────────────────────────

const NAME_PREFIX = env.namePrefix

const LOG_GROUP_MAP: Record<string, string> = {
  'api-node':   `/ecs/${NAME_PREFIX}/api-node`,
  'api-python': `/ecs/${NAME_PREFIX}/api-python`,
  'api-spring': `/ecs/${NAME_PREFIX}/api-spring`,
  'frontend':   `/ecs/${NAME_PREFIX}/frontend`,
  'vpc':        `/vpc/flow-logs/${NAME_PREFIX}`,
}

const WAF_RULES: Record<string, string> = {
  IPReputationList: `${NAME_PREFIX}-waf-ip-reputation`,
  KnownBadInputs:   `${NAME_PREFIX}-waf-bad-inputs`,
  CommonRuleSet:    `${NAME_PREFIX}-waf-common`,
  RateLimit:        `${NAME_PREFIX}-waf-rate-limit`,
}

const SIDEBAR_ECS_SERVICES = [
  { id: 'api-node',   label: 'Node.js API' },
  { id: 'api-python', label: 'Python API' },
  { id: 'api-spring', label: 'Spring API' },
  { id: 'frontend',   label: 'Frontend' },
]

const PROMETHEUS_URL =
  env.prometheusUrl || 'https://d2xkz85otik7ek.cloudfront.net/api/metrics'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────

interface MetricResult {
  Timestamps?: Date[]
  Values?: number[]
}

function toTimeseries(result: MetricResult, multiplier = 1) {
  const pairs = (result.Timestamps || []).map((t, i) => ({
    t,
    v: (result.Values ?? [])[i] ?? 0,
  }))
  pairs.sort((a, b) => a.t.getTime() - b.t.getTime())
  return pairs.map(({ t, v }) => ({
    timestamp: t.toISOString(),
    value: Math.round(v * multiplier * 10000) / 10000,
  }))
}

function summarizeEcsTask(task: Task) {
  const taskId = (task.taskArn ?? '').split('/').pop() ?? ''
  const tdShort = (task.taskDefinitionArn ?? '').split(':').pop() ?? null
  const containers = task.containers ?? []
  const primary = containers[0] ?? null

  let privateIp = ''
  for (const c of containers) {
    for (const ni of c.networkInterfaces ?? []) {
      if (ni.privateIpv4Address) { privateIp = ni.privateIpv4Address; break }
    }
    if (privateIp) break
  }
  if (!privateIp && task.attachments) {
    for (const att of task.attachments) {
      for (const d of att.details ?? []) {
        if (d.name === 'privateIPv4Address' && d.value) privateIp = d.value
      }
    }
  }

  return {
    task_id:           taskId,
    last_status:       task.lastStatus ?? null,
    health_status:     task.healthStatus ?? null,
    launch_type:       task.launchType ?? null,
    availability_zone: task.availabilityZone ?? null,
    task_definition:   tdShort,
    task_cpu:          task.cpu ?? null,
    task_memory:       task.memory ?? null,
    container_name:    primary?.name ?? null,
    image:             primary?.image ?? null,
    images:            containers.map((c) => c.image).filter(Boolean),
    private_ip:        privateIp || null,
  }
}

function isAccessDenied(err: unknown) {
  return (
    err instanceof Error &&
    (err.name === 'AccessDeniedException' || err.name === 'AccessDenied')
  )
}

function handleError(res: Response, err: unknown, ctx: string) {
  if (isAccessDenied(err)) {
    return res.status(403).json({ detail: `${ctx} 읽기 권한 없음. AWS credentials 확인 필요.` })
  }
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[${ctx}]`, message)
  res.status(500).json({ detail: message })
}

// ── 라우터 ─────────────────────────────────────────────────────────────────

export const dashboardRouter = Router()

// CloudWatch Logs
dashboardRouter.get('/dashboard/logs/:service', async (req: Request, res: Response) => {
  const { service } = req.params
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200)

  const logGroup = LOG_GROUP_MAP[service as string]
  if (!logGroup) {
    res.status(400).json({
      detail: `지원하지 않는 서비스. 가능한 값: ${Object.keys(LOG_GROUP_MAP).join(', ')}`,
    })
    return
  }

  try {
    const streamsResp = await logsClient.send(new DescribeLogStreamsCommand({
      logGroupName: logGroup,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 1,
    }))

    if (!streamsResp.logStreams?.length) {
      res.json({ service, log_group: logGroup, logs: [] })
      return
    }

    const streamName = streamsResp.logStreams[0].logStreamName!
    const eventsResp = await logsClient.send(new GetLogEventsCommand({
      logGroupName: logGroup,
      logStreamName: streamName,
      limit,
      startFromHead: false,
    }))

    const events = eventsResp.events ?? []
    res.json({
      service,
      log_group: logGroup,
      stream: streamName,
      count: events.length,
      logs: events.map((e) => ({
        timestamp: e.timestamp,
        message: (e.message ?? '').trim(),
      })),
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ResourceNotFoundException') {
      res.status(404).json({ detail: `로그 그룹 없음: ${logGroup}` })
      return
    }
    handleError(res, err, 'CloudWatch Logs')
  }
})

// ECS 메트릭 (CPU / 메모리)
dashboardRouter.get('/dashboard/metrics/ecs', async (req: Request, res: Response) => {
  const serviceName = (req.query.service_name as string) || 'api-node'
  const period      = parseInt((req.query.period as string) || '300', 10)
  const points      = parseInt((req.query.points as string) || '12', 10)
  const cluster     = `${NAME_PREFIX}-cluster`
  const fullService = `${NAME_PREFIX}-${serviceName}`
  const endTime     = new Date()
  const startTime   = new Date(endTime.getTime() - period * points * 1000)

  const dimensions = [
    { Name: 'ClusterName', Value: cluster },
    { Name: 'ServiceName', Value: fullService },
  ]

  const metricQuery = (id: string, metricName: string): MetricDataQuery => ({
    Id: id,
    MetricStat: {
      Metric: { Namespace: 'AWS/ECS', MetricName: metricName, Dimensions: dimensions },
      Period: period,
      Stat: 'Average',
    },
  })

  try {
    const resp = await cwClient.send(new GetMetricDataCommand({
      MetricDataQueries: [
        metricQuery('cpu', 'CPUUtilization'),
        metricQuery('memory', 'MemoryUtilization'),
      ],
      StartTime: startTime,
      EndTime: endTime,
    }))
    const results = Object.fromEntries(
      (resp.MetricDataResults ?? []).map((r) => [r.Id!, r])
    )
    res.json({
      service: fullService,
      cluster,
      cpu:    toTimeseries(results['cpu']),
      memory: toTimeseries(results['memory']),
    })
  } catch (err) {
    handleError(res, err, 'CloudWatch ECS Metrics')
  }
})

// ECS 서비스 목록
dashboardRouter.get('/dashboard/services', async (_req: Request, res: Response) => {
  const cluster = `${NAME_PREFIX}-cluster`
  const serviceNames = SIDEBAR_ECS_SERVICES.map((s) => `${NAME_PREFIX}-${s.id}`)

  try {
    const resp = await ecsClient.send(new DescribeServicesCommand({ cluster, services: serviceNames }))

    const byName = new Map((resp.services ?? []).map((svc) => [svc.serviceName!, svc]))
    const failedName = new Set<string>()
    for (const f of resp.failures ?? []) {
      const tail = (f.arn ?? '').split('/').pop()
      if (tail) failedName.add(tail)
    }

    const services = []
    for (const def of SIDEBAR_ECS_SERVICES) {
      const fullName = `${NAME_PREFIX}-${def.id}`
      const s = byName.get(fullName)

      if (!s) {
        services.push({
          id: def.id, label: def.label, full_name: fullName, cluster,
          status: failedName.has(fullName) ? 'MISSING' : 'UNKNOWN',
          running_count: 0, tasks: [],
        })
        continue
      }

      const running = s.runningCount ?? 0
      let tasksOut: ReturnType<typeof summarizeEcsTask>[] = []

      if (running >= 1) {
        try {
          const listResp = await ecsClient.send(new ListTasksCommand({
            cluster, serviceName: fullName, desiredStatus: 'RUNNING',
          }))
          const arns = listResp.taskArns ?? []
          if (arns.length > 0) {
            const descResp = await ecsClient.send(new DescribeTasksCommand({
              cluster, tasks: arns.slice(0, 100),
            }))
            tasksOut = (descResp.tasks ?? []).map(summarizeEcsTask)
          }
        } catch (e) {
          console.warn(`[ECS List/DescribeTasks] ${fullName}`, e)
        }
      }

      services.push({
        id: def.id, label: def.label, full_name: fullName, cluster,
        status: s.status ?? 'UNKNOWN',
        running_count: running,
        tasks: tasksOut,
      })
    }

    res.json({ region: env.awsRegion, name_prefix: NAME_PREFIX, cluster, services })
  } catch (err) {
    handleError(res, err, 'ECS DescribeServices')
  }
})

// CloudTrail
dashboardRouter.get('/dashboard/cloudtrail', async (req: Request, res: Response) => {
  const limit     = Math.min(parseInt((req.query.limit as string) || '20', 10), 50)
  const eventName = req.query.event_name as string | undefined

  const params: ConstructorParameters<typeof LookupEventsCommand>[0] = { MaxResults: limit }
  if (eventName) {
    params.LookupAttributes = [{ AttributeKey: 'EventName', AttributeValue: eventName }]
  }

  try {
    const resp = await trailClient.send(new LookupEventsCommand(params))
    const events = (resp.Events ?? []).map((e) => {
      let raw: Record<string, unknown> = {}
      try { raw = JSON.parse(e.CloudTrailEvent ?? '{}') } catch (_) {}
      return {
        event_time:   e.EventTime?.toISOString() ?? '',
        event_name:   e.EventName   ?? '',
        event_source: e.EventSource ?? '',
        username:     e.Username    ?? '',
        source_ip:    (raw.sourceIPAddress as string) ?? '',
        resources:    (e.Resources ?? []).map((r) => ({
          type: r.ResourceType ?? '',
          name: r.ResourceName ?? '',
        })),
      }
    })
    res.json({ count: events.length, events })
  } catch (err) {
    handleError(res, err, 'CloudTrail')
  }
})

// GuardDuty
dashboardRouter.get('/dashboard/guardduty', async (req: Request, res: Response) => {
  const minSeverity = parseFloat((req.query.min_severity as string) || '0')
  const limit       = Math.min(parseInt((req.query.limit as string) || '20', 10), 50)

  try {
    const detectors  = await gdClient.send(new ListDetectorsCommand({}))
    const ids        = detectors.DetectorIds ?? []

    if (ids.length === 0) {
      res.json({ count: 0, findings: [], message: 'GuardDuty detector가 없습니다.' })
      return
    }

    const detectorId = ids[0]
    const criteria   = minSeverity > 0
      ? { Criterion: { severity: { Gte: minSeverity * 10 } } }
      : {}

    const findingResp = await gdClient.send(new ListFindingsCommand({
      DetectorId: detectorId,
      FindingCriteria: criteria,
      MaxResults: limit,
    }))

    const findingIds = findingResp.FindingIds ?? []
    if (findingIds.length === 0) {
      res.json({ count: 0, findings: [], detector_id: detectorId })
      return
    }

    const getResp = await gdClient.send(new GetFindingsCommand({
      DetectorId: detectorId,
      FindingIds: findingIds,
    }))

    const findings = (getResp.Findings ?? [])
      .map((f) => ({
        id:             f.Id,
        title:          f.Title,
        description:    f.Description,
        severity:       f.Severity,
        severity_label: (f.Severity ?? 0) >= 7 ? '높음' : (f.Severity ?? 0) >= 4 ? '중간' : '낮음',
        type:           f.Type,
        updated_at:     typeof f.UpdatedAt === 'string' ? f.UpdatedAt : '',
        region:         f.Region ?? '',
      }))
      .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))

    res.json({ count: findings.length, detector_id: detectorId, findings })
  } catch (err) {
    handleError(res, err, 'GuardDuty')
  }
})

// WAF 메트릭
dashboardRouter.get('/dashboard/metrics/waf', async (req: Request, res: Response) => {
  const period    = parseInt((req.query.period as string) || '3600', 10)
  const points    = parseInt((req.query.points as string) || '24', 10)
  const endTime   = new Date()
  const startTime = new Date(endTime.getTime() - period * points * 1000)

  const queries: MetricDataQuery[] = Object.entries(WAF_RULES).map(([ruleName, metricName], idx) => ({
    Id:    `rule${idx}`,
    Label: ruleName,
    MetricStat: {
      Metric: {
        Namespace:  'AWS/WAFV2',
        MetricName: 'BlockedRequests',
        Dimensions: [
          { Name: 'WebACL', Value: `${NAME_PREFIX}-waf` },
          { Name: 'Rule',   Value: metricName },
          { Name: 'Region', Value: 'CloudFront' },
        ],
      },
      Period: period,
      Stat:   'Sum',
    },
  }))

  try {
    const resp = await cwUsEast1.send(new GetMetricDataCommand({
      MetricDataQueries: queries,
      StartTime: startTime,
      EndTime:   endTime,
    }))
    const rulesData: Record<string, unknown> = {}
    for (const r of resp.MetricDataResults ?? []) {
      rulesData[r.Label!] = {
        timeseries: toTimeseries(r),
        total: Math.round((r.Values ?? []).reduce((s, v) => s + v, 0)),
      }
    }
    res.json({ period_hours: Math.floor(period * points / 3600), rules: rulesData })
  } catch (err) {
    handleError(res, err, 'CloudWatch WAF Metrics')
  }
})

// CloudWatch 알람
dashboardRouter.get('/dashboard/alarms', async (_req: Request, res: Response) => {
  try {
    const resp = await cwClient.send(new DescribeAlarmsCommand({
      AlarmNamePrefix: NAME_PREFIX,
      AlarmTypes: ['MetricAlarm'],
    }))
    const alarms = (resp.MetricAlarms ?? [])
      .map((a) => ({
        name:       a.AlarmName,
        state:      a.StateValue,
        reason:     a.StateReason,
        updated_at: a.StateUpdatedTimestamp?.toISOString() ?? '',
        metric:     a.MetricName,
        threshold:  a.Threshold,
        comparison: a.ComparisonOperator,
        namespace:  a.Namespace,
      }))
      .sort((a, b) => {
        if (a.state === 'ALARM' && b.state !== 'ALARM') return -1
        if (a.state !== 'ALARM' && b.state === 'ALARM') return 1
        return (a.name ?? '').localeCompare(b.name ?? '')
      })
    res.json({
      count:       alarms.length,
      alarm_count: alarms.filter((a) => a.state === 'ALARM').length,
      ok_count:    alarms.filter((a) => a.state === 'OK').length,
      alarms,
    })
  } catch (err) {
    handleError(res, err, 'CloudWatch Alarms')
  }
})

// RDS 메트릭
dashboardRouter.get('/dashboard/metrics/rds', async (req: Request, res: Response) => {
  const period    = parseInt((req.query.period as string) || '300', 10)
  const points    = parseInt((req.query.points as string) || '12', 10)
  const endTime   = new Date()
  const startTime = new Date(endTime.getTime() - period * points * 1000)
  const dbId      = `${NAME_PREFIX}-mysql`
  const dimensions = [{ Name: 'DBInstanceIdentifier', Value: dbId }]

  const rdsQuery = (id: string, metricName: string, stat = 'Average'): MetricDataQuery => ({
    Id: id,
    MetricStat: {
      Metric: { Namespace: 'AWS/RDS', MetricName: metricName, Dimensions: dimensions },
      Period: period,
      Stat:   stat,
    },
  })

  try {
    let allocatedStorageGb: number | undefined
    try {
      const dr = await rdsApiClient.send(new DescribeDBInstancesCommand({}))
      const inst = (dr.DBInstances ?? []).find((i) => i.DBInstanceIdentifier === dbId)
      if (inst && typeof inst.AllocatedStorage === 'number' && inst.AllocatedStorage > 0) {
        allocatedStorageGb = inst.AllocatedStorage
      }
    } catch (_) { /* 할당 용량 없이 FreeStorageSpace만 제공 */ }

    const resp = await cwClient.send(new GetMetricDataCommand({
      MetricDataQueries: [
        rdsQuery('read_lat',     'ReadLatency'),
        rdsQuery('write_lat',    'WriteLatency'),
        rdsQuery('connections',  'DatabaseConnections'),
        rdsQuery('cpu',          'CPUUtilization'),
        rdsQuery('memory',       'FreeableMemory'),
        rdsQuery('free_storage', 'FreeStorageSpace'),
        rdsQuery('read_iops',    'ReadIOPS'),
        rdsQuery('write_iops',   'WriteIOPS'),
      ],
      StartTime: startTime,
      EndTime:   endTime,
    }))
    const results = Object.fromEntries(
      (resp.MetricDataResults ?? []).map((r) => [r.Id!, r])
    )

    const last = (id: string, mul = 1) => {
      const vals = results[id]?.Values ?? []
      if (!vals.length) return 0
      return Math.round(vals[vals.length - 1] * mul * 100) / 100
    }

    res.json({
      db_identifier: dbId,
      current: {
        read_latency_ms:      last('read_lat', 1000),
        write_latency_ms:     last('write_lat', 1000),
        connections:          Math.round(last('connections')),
        cpu_percent:          last('cpu'),
        freeable_memory_mb:   Math.round(last('memory') / 1024 / 1024),
        free_storage_gb:      Math.round((last('free_storage') / 1024 / 1024 / 1024) * 100) / 100,
        allocated_storage_gb: allocatedStorageGb,
        read_iops:            Math.round(last('read_iops') * 100) / 100,
        write_iops:           Math.round(last('write_iops') * 100) / 100,
      },
      timeseries: {
        read_latency:       toTimeseries(results['read_lat'], 1000),
        write_latency:      toTimeseries(results['write_lat'], 1000),
        connections:        toTimeseries(results['connections']),
        cpu:                toTimeseries(results['cpu']),
        freeable_memory_mb: toTimeseries(results['memory'], 1 / 1024 / 1024),
      },
    })
  } catch (err) {
    handleError(res, err, 'CloudWatch RDS Metrics')
  }
})

// ALB 메트릭
dashboardRouter.get('/dashboard/metrics/alb', async (req: Request, res: Response) => {
  const period    = parseInt((req.query.period as string) || '300', 10)
  const points    = parseInt((req.query.points as string) || '12', 10)
  const endTime   = new Date()
  const startTime = new Date(endTime.getTime() - period * points * 1000)

  try {
    const lbResp = await elbClient.send(new DescribeLoadBalancersCommand({}))
    const alb    = (lbResp.LoadBalancers ?? []).find((a) =>
      (a.LoadBalancerName ?? '').includes(NAME_PREFIX)
    )

    if (!alb) {
      res.json({
        error: 'ALB를 찾을 수 없습니다.',
        found: (lbResp.LoadBalancers ?? []).map((a) => a.LoadBalancerName),
      })
      return
    }

    const albDimVal = alb.LoadBalancerArn!.split('/').slice(-3).join('/')
    const albDim    = [{ Name: 'LoadBalancer', Value: albDimVal }]
    const clusterName  = `${NAME_PREFIX}-cluster`
    const ecsServiceNm = `${NAME_PREFIX}-api-node`
    const ecsSvcDim    = [
      { Name: 'ClusterName', Value: clusterName },
      { Name: 'ServiceName', Value: ecsServiceNm },
    ]

    const albQuery = (id: string, metricName: string, stat = 'Sum'): MetricDataQuery => ({
      Id: id,
      MetricStat: {
        Metric: { Namespace: 'AWS/ApplicationELB', MetricName: metricName, Dimensions: albDim },
        Period: period, Stat: stat,
      },
    })
    const ecsSvcQuery = (id: string, metricName: string, stat = 'Sum'): MetricDataQuery => ({
      Id: id,
      MetricStat: {
        Metric: { Namespace: 'AWS/ECS', MetricName: metricName, Dimensions: ecsSvcDim },
        Period: period, Stat: stat,
      },
    })

    const cwResp = await cwClient.send(new GetMetricDataCommand({
      MetricDataQueries: [
        albQuery('req',        'RequestCount'),
        albQuery('resp_time',  'TargetResponseTime', 'Average'),
        albQuery('healthy',    'HealthyHostCount',   'Average'),
        albQuery('unhealthy',  'UnHealthyHostCount', 'Average'),
        albQuery('err4xx',     'HTTPCode_Target_4XX_Count'),
        albQuery('err5xx',     'HTTPCode_Target_5XX_Count'),
        albQuery('ok2xx',      'HTTPCode_Target_2XX_Count'),
        albQuery('conn',       'ActiveConnectionCount', 'Average'),
        albQuery('new_conn',   'NewConnectionCount'),
        albQuery('rej_conn',   'RejectedConnectionCount'),
        albQuery('proc_bytes', 'ProcessedBytes'),
        ecsSvcQuery('net_in',  'NetworkRxBytes'),
        ecsSvcQuery('net_out', 'NetworkTxBytes'),
      ],
      StartTime: startTime,
      EndTime:   endTime,
    }))
    const results = Object.fromEntries(
      (cwResp.MetricDataResults ?? []).map((r) => [r.Id!, r])
    )

    const last = (id: string, mul = 1) => {
      const vals = (results[id]?.Values) ?? []
      if (!vals.length) return 0
      return Math.round(vals[vals.length - 1] * mul * 10000) / 10000
    }

    const tgResp = await elbClient.send(
      new DescribeTargetGroupsCommand({ LoadBalancerArn: alb.LoadBalancerArn })
    )
    const targetHealth = await Promise.all(
      (tgResp.TargetGroups ?? []).map(async (tg) => {
        const h = await elbClient.send(
          new DescribeTargetHealthCommand({ TargetGroupArn: tg.TargetGroupArn })
        )
        const states = (h.TargetHealthDescriptions ?? []).map(
          (t) => t.TargetHealth?.State
        )
        return {
          name:    tg.TargetGroupName,
          healthy: states.filter((s) => s === 'healthy').length,
          total:   states.length,
          port:    tg.Port ?? 0,
        }
      })
    )

    const reqLast  = last('req')
    const rps      = period > 0 ? Math.round((reqLast / period) * 100) / 100 : 0
    const mbPerSec = period > 0 ? 1 / period / 1024 / 1024 : 0

    res.json({
      alb_name:    alb.LoadBalancerName,
      period_sec:  period,
      ecs_service: ecsServiceNm,
      current: {
        healthy_hosts:                    Math.round(last('healthy')),
        unhealthy_hosts:                  Math.round(last('unhealthy')),
        response_time_ms:                 Math.round(last('resp_time') * 1000 * 10) / 10,
        rps,
        request_count_last_bucket:        reqLast,
        active_connections:               Math.round(last('conn') * 10) / 10,
        http_2xx_last_bucket:             Math.round(last('ok2xx')),
        http_4xx_last_bucket:             Math.round(last('err4xx')),
        http_5xx_last_bucket:             Math.round(last('err5xx')),
        ecs_network_rx_bytes_last_bucket: Math.round(last('net_in')),
        ecs_network_tx_bytes_last_bucket: Math.round(last('net_out')),
      },
      target_health: targetHealth,
      timeseries: {
        request_count:        toTimeseries(results['req']),
        response_time:        toTimeseries(results['resp_time'], 1000),
        '2xx':                toTimeseries(results['ok2xx']),
        '4xx':                toTimeseries(results['err4xx']),
        '5xx':                toTimeseries(results['err5xx']),
        ecs_network_rx_mb_s:  toTimeseries(results['net_in'],  mbPerSec),
        ecs_network_tx_mb_s:  toTimeseries(results['net_out'], mbPerSec),
        alb_processed_mb_s:   toTimeseries(results['proc_bytes'], mbPerSec),
        active_connections:   toTimeseries(results['conn']),
        healthy_hosts:        toTimeseries(results['healthy']),
        unhealthy_hosts:      toTimeseries(results['unhealthy']),
        new_connections:      toTimeseries(results['new_conn']),
        rejected_connections: toTimeseries(results['rej_conn']),
      },
    })
  } catch (err) {
    handleError(res, err, 'CloudWatch ALB Metrics')
  }
})

// Prometheus 프록시
dashboardRouter.get('/dashboard/metrics/prometheus', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(PROMETHEUS_URL)
    if (!resp.ok) throw new Error(`upstream HTTP ${resp.status}`)
    const text = await resp.text()
    res.set('Content-Type', 'text/plain; version=0.0.4')
    res.send(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(502).json({ detail: `Prometheus 엔드포인트 연결 실패: ${message}` })
  }
})
