// Prometheus exposition format 파서

export interface MetricSample {
  name: string
  labels: Record<string, string>
  value: number
}

/**
 * Prometheus 텍스트 형식을 파싱하여 MetricSample 배열로 반환
 */
export function parsePrometheus(text: string): MetricSample[] {
  const samples: MetricSample[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // metric_name{labels} value [timestamp]
    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([\d.+eE-]+|NaN|Inf|-Inf)/)
    if (!match) continue

    const name = match[1]
    const labelsStr = match[2] || ''
    const value = parseFloat(match[3])
    if (isNaN(value)) continue

    const labels: Record<string, string> = {}
    if (labelsStr) {
      const labelBody = labelsStr.slice(1, -1) // 중괄호 제거
      const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g
      let m: RegExpExecArray | null
      while ((m = labelRegex.exec(labelBody)) !== null) {
        labels[m[1]] = m[2]
      }
    }

    samples.push({ name, labels, value })
  }

  return samples
}

/**
 * 특정 메트릭 이름 + 라벨 조건으로 샘플 필터링
 */
export function filterSamples(
  samples: MetricSample[],
  name: string,
  labelMatch?: Record<string, string>
): MetricSample[] {
  return samples.filter((s) => {
    if (s.name !== name) return false
    if (!labelMatch) return true
    return Object.entries(labelMatch).every(([k, v]) => s.labels[k] === v)
  })
}

/**
 * http_requests_total에서 라우트별 집계
 * Returns: { route → { total, '2xx', '4xx', '5xx' } }
 */
export function aggregateRequestsByRoute(samples: MetricSample[]): Record<string, {
  total: number
  '2xx': number
  '4xx': number
  '5xx': number
}> {
  const result: Record<string, { total: number; '2xx': number; '4xx': number; '5xx': number }> = {}

  const totals = filterSamples(samples, 'http_requests_total')
  for (const s of totals) {
    const route = s.labels.route || 'unknown'
    const code = parseInt(s.labels.status_code || '0')
    if (!result[route]) result[route] = { total: 0, '2xx': 0, '4xx': 0, '5xx': 0 }
    result[route].total += s.value
    if (code >= 200 && code < 300) result[route]['2xx'] += s.value
    else if (code >= 400 && code < 500) result[route]['4xx'] += s.value
    else if (code >= 500) result[route]['5xx'] += s.value
  }

  return result
}

/**
 * histogram에서 P50/P95/P99 계산
 * le 버킷 데이터로 선형 보간
 */
export function calcPercentile(
  samples: MetricSample[],
  metricBase: string, // e.g. 'http_request_duration_ms'
  labelMatch: Record<string, string>,
  percentile: number // 0~1
): number {
  const buckets = filterSamples(samples, `${metricBase}_bucket`, labelMatch)
    .filter((s) => s.labels.le !== undefined)
    .map((s) => ({ le: s.labels.le === '+Inf' ? Infinity : parseFloat(s.labels.le), count: s.value }))
    .sort((a, b) => a.le - b.le)

  if (buckets.length === 0) return 0

  const total = buckets[buckets.length - 1].count
  if (total === 0) return 0

  const target = total * percentile
  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].count >= target) {
      if (i === 0) return buckets[i].le
      const lower = buckets[i - 1]
      const upper = buckets[i]
      if (!isFinite(upper.le)) return lower.le
      const fraction = (target - lower.count) / (upper.count - lower.count)
      return lower.le + fraction * (upper.le - lower.le)
    }
  }

  return buckets[buckets.length - 2]?.le ?? 0
}

/**
 * Prometheus 텍스트에서 "# HELP <metric_name> <description>" 라인을 파싱해
 * metric 이름별 설명(HELP)을 반환합니다.
 */
export function parsePrometheusHelp(text: string): Record<string, string> {
  const help: Record<string, string> = {}

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('# HELP ')) continue

    // # HELP metric_name description...
    const match = trimmed.match(/^# HELP\s+([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(.*)$/)
    if (!match) continue
    const name = match[1]
    const desc = match[2] ?? ''
    help[name] = desc
  }

  return help
}
