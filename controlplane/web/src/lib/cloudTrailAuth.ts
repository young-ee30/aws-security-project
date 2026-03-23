/**
 * CloudTrail 이벤트 중 인증·권한(IAM·STS·콘솔 로그인 등)에 가까운 것만 식별
 */
import type { TrailEvent } from '@/hooks/useDashboardData'

export function isAuthRelatedTrailEvent(e: TrailEvent): boolean {
  const name = (e.event_name || '').toLowerCase()
  const src = (e.event_source || '').toLowerCase()
  if (/signin\.amazonaws\.com|iam\.amazonaws\.com|sts\.amazonaws\.com|cognito|sso\.amazonaws\.com/.test(src))
    return true
  if (
    /consolelogin|assumerole|getsessiontoken|getfederationtoken|createloginprofile|deleteloginprofile|createaccesskey|deleteaccesskey|updateaccesskey|changepassword|updateuser|attachuserpolicy|attachrolepolicy|putuserpolicy|putrolepolicy|createuser|deleteuser|createrole|deleterole|mfadevice|virtualmfadevice|password|token|federation|getcalleridentity/i.test(
      name,
    )
  )
    return true
  return false
}

export function filterAuthTrailEvents(events: TrailEvent[]): TrailEvent[] {
  return events.filter(isAuthRelatedTrailEvent)
}

/** 이벤트 이름 기준 위험도(침해 분석용 러프 분류) */
export function trailAuthRiskTier(eventName: string): 'high' | 'medium' | 'low' {
  const n = eventName.toLowerCase()
  if (/delete|remove|stoplogging|detach|putuserpolicy|putrolepolicy|attachuserpolicy|createlogin|createaccesskey|root/i.test(n))
    return 'high'
  if (/assume|consolelogin|password|changepassword|mfadevice|getsessiontoken|createrole|createuser/i.test(n))
    return 'medium'
  return 'low'
}

/** 인증 필터 없이 전체 Management 이벤트용 러프 위험도 */
export function trailMgmtEventRiskHint(eventName: string): 'high' | 'medium' | 'low' {
  const n = (eventName || '').toLowerCase()
  if (
    /delete|remove|stoplogging|detach|root|createlogin|createaccesskey|attachuserpolicy|putuserpolicy|putrolepolicy|disable|terminate/i.test(
      n,
    )
  )
    return 'high'
  if (/assume|consolelogin|authorize|putbucket|kms|decrypt|password|update|create|attach/i.test(n)) return 'medium'
  return 'low'
}

export function countByKey(items: string[]): { key: string; count: number }[] {
  const m = new Map<string, number>()
  for (const k of items) {
    const key = k.trim() || '—'
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}
