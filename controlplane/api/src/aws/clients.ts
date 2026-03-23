import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs'
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch'
import { CloudTrailClient } from '@aws-sdk/client-cloudtrail'
import { GuardDutyClient } from '@aws-sdk/client-guardduty'
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2'
import { ECSClient } from '@aws-sdk/client-ecs'
import { RDSClient } from '@aws-sdk/client-rds'
import { env } from '../config/env.js'

export const logsClient  = new CloudWatchLogsClient({ region: env.awsRegion })
export const cwClient    = new CloudWatchClient({ region: env.awsRegion })
export const cwUsEast1   = new CloudWatchClient({ region: 'us-east-1' }) // WAF CloudFront 전용
export const trailClient = new CloudTrailClient({ region: env.awsRegion })
export const gdClient    = new GuardDutyClient({ region: env.awsRegion })
export const elbClient   = new ElasticLoadBalancingV2Client({ region: env.awsRegion })
export const ecsClient   = new ECSClient({ region: env.awsRegion })
export const rdsApiClient = new RDSClient({ region: env.awsRegion })
