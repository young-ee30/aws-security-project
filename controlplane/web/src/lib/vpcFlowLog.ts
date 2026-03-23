/**
 * VPC Flow Log 원문(CloudWatch Logs 샘플)에서 러프 분류
 * — 표준 공백 구분 v2 형식뿐 아니라 키워드로 ACCEPT/REJECT 추정
 */
export function vpcFlowActionCategory(message: string): 'ACCEPT' | 'REJECT' | 'OTHER' {
  const u = message.toUpperCase()
  if (/\bREJECT\b/.test(u)) return 'REJECT'
  if (/\bACCEPT\b/.test(u)) return 'ACCEPT'
  return 'OTHER'
}
