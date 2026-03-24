import type { IncidentAiAnalysisRequest, IncidentAiAnalysisResponse } from '@/lib/incidentAi'

interface IncidentReportInput {
  request: IncidentAiAnalysisRequest
  analysis: IncidentAiAnalysisResponse
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function buildTimestampForFile(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildMarkdownList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- 없음'
}

function buildSummaryCardsMarkdown(input: IncidentAiAnalysisRequest) {
  if (input.summaryCards.length === 0) {
    return '- 수집된 요약 카드 없음'
  }

  return input.summaryCards
    .map((card) => `- ${card.title}: ${card.value}${card.sub ? ` (${card.sub})` : ''}${card.source ? ` [${card.source}]` : ''}`)
    .join('\n')
}

function buildLogSampleMarkdown(input: IncidentAiAnalysisRequest) {
  const samples = input.logLines.slice(0, 12)
  if (samples.length === 0) {
    return '- 수집된 로그 샘플 없음'
  }

  return samples
    .map((log) => {
      const parts = [log.time, log.source, log.severity].filter(Boolean)
      return `- ${parts.join(' | ')}${parts.length > 0 ? ' | ' : ''}${log.text}`
    })
    .join('\n')
}

export function buildIncidentReportMarkdown({ request, analysis }: IncidentReportInput) {
  const generatedAt = new Date().toLocaleString('ko-KR')

  return [
    `# ${request.title}`,
    '',
    '## 개요',
    `- 페이지: ${request.page === 'gwanje' ? '관제' : '침해'}`,
    `- 보고서 생성 시각: ${generatedAt}`,
    `- 기준 시각: ${request.lastUpdated || '알 수 없음'}`,
    `- AI 제공자: ${analysis.provider === 'gemini' ? 'Gemini' : 'Fallback'}`,
    `- 수집 요약 카드 수: ${request.summaryCards.length}`,
    `- 수집 로그 수: ${request.logLines.length}`,
    '',
    '## 전체 요약',
    analysis.overview,
    '',
    '## 핵심 포인트',
    buildMarkdownList(analysis.keyFindings),
    '',
    '## 주의할 리스크',
    buildMarkdownList(analysis.risks),
    '',
    '## 권장 대응',
    buildMarkdownList(analysis.recommendedActions),
    '',
    '## 근거 로그',
    buildMarkdownList(analysis.evidence),
    '',
    '## 요약 카드 스냅샷',
    buildSummaryCardsMarkdown(request),
    '',
    '## 로그 샘플',
    buildLogSampleMarkdown(request),
    '',
  ].join('\n')
}

function buildSectionHtml(title: string, items: string[]) {
  if (items.length === 0) {
    return ''
  }

  return `
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>
  `
}

export function buildIncidentReportHtml({ request, analysis }: IncidentReportInput) {
  const generatedAt = new Date().toLocaleString('ko-KR')
  const summaryCards = request.summaryCards
    .map(
      (card) => `
        <div class="card">
          <div class="card-title">${escapeHtml(card.title)}</div>
          <div class="card-value">${escapeHtml(card.value)}</div>
          ${card.sub ? `<div class="card-sub">${escapeHtml(card.sub)}</div>` : ''}
          ${card.source ? `<div class="card-source">${escapeHtml(card.source)}</div>` : ''}
        </div>
      `,
    )
    .join('')

  const logSamples = request.logLines
    .slice(0, 12)
    .map((log) => {
      const parts = [log.time, log.source, log.severity].filter(Boolean).join(' | ')
      return `<li>${parts ? `<strong>${escapeHtml(parts)}</strong> | ` : ''}${escapeHtml(log.text)}</li>`
    })
    .join('')

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(request.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f6fb;
        --panel: #ffffff;
        --line: #d8dfeb;
        --text: #162033;
        --muted: #59657d;
        --accent: #2557d6;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        background: var(--bg);
        color: var(--text);
        font-family: "Pretendard", "Noto Sans KR", sans-serif;
      }
      .report {
        max-width: 960px;
        margin: 0 auto;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        overflow: hidden;
      }
      .hero {
        padding: 28px 32px;
        background: linear-gradient(135deg, #edf3ff 0%, #ffffff 100%);
        border-bottom: 1px solid var(--line);
      }
      .eyebrow {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        background: #dbe7ff;
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
      }
      h1 {
        margin: 14px 0 8px;
        font-size: 28px;
        line-height: 1.25;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 18px;
        margin-top: 18px;
        color: var(--muted);
        font-size: 14px;
      }
      .body { padding: 28px 32px 36px; }
      .section { margin-top: 26px; }
      .section h2 {
        margin: 0 0 12px;
        font-size: 18px;
      }
      .section p, .section li {
        color: var(--text);
        font-size: 14px;
        line-height: 1.75;
      }
      .section ul {
        margin: 0;
        padding-left: 20px;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px 16px;
        background: #fafcff;
      }
      .card-title {
        font-size: 13px;
        color: var(--muted);
      }
      .card-value {
        margin-top: 8px;
        font-size: 20px;
        font-weight: 700;
      }
      .card-sub, .card-source {
        margin-top: 6px;
        font-size: 12px;
        color: var(--muted);
      }
      @media print {
        body { padding: 0; background: #fff; }
        .report { border: none; border-radius: 0; }
      }
    </style>
  </head>
  <body>
    <article class="report">
      <header class="hero">
        <span class="eyebrow">${request.page === 'gwanje' ? '관제 보고서' : '침해 보고서'}</span>
        <h1>${escapeHtml(request.title)}</h1>
        <div class="meta">
          <div>보고서 생성 시각: ${escapeHtml(generatedAt)}</div>
          <div>기준 시각: ${escapeHtml(request.lastUpdated || '알 수 없음')}</div>
          <div>AI 제공자: ${analysis.provider === 'gemini' ? 'Gemini' : 'Fallback'}</div>
          <div>수집 로그 수: ${request.logLines.length}</div>
        </div>
      </header>
      <main class="body">
        <section class="section">
          <h2>전체 요약</h2>
          <p>${escapeHtml(analysis.overview)}</p>
        </section>
        ${buildSectionHtml('핵심 포인트', analysis.keyFindings)}
        ${buildSectionHtml('주의할 리스크', analysis.risks)}
        ${buildSectionHtml('권장 대응', analysis.recommendedActions)}
        ${buildSectionHtml('근거 로그', analysis.evidence)}
        <section class="section">
          <h2>요약 카드 스냅샷</h2>
          <div class="cards">${summaryCards || '<p>수집된 카드 없음</p>'}</div>
        </section>
        <section class="section">
          <h2>로그 샘플</h2>
          <ul>${logSamples || '<li>수집된 로그 샘플 없음</li>'}</ul>
        </section>
      </main>
    </article>
  </body>
</html>`
}

export function downloadIncidentReportMarkdown(input: IncidentReportInput) {
  const markdown = buildIncidentReportMarkdown(input)
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${input.request.page}-report-${buildTimestampForFile()}.md`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function openIncidentReportPrintWindow(input: IncidentReportInput) {
  const printWindow = window.open('', '_blank', 'width=1080,height=860')
  if (!printWindow) {
    throw new Error('브라우저에서 팝업이 차단되어 PDF 인쇄 창을 열 수 없습니다.')
  }

  printWindow.document.open()
  printWindow.document.write(buildIncidentReportHtml(input))
  printWindow.document.close()
  printWindow.focus()
  window.setTimeout(() => {
    printWindow.print()
  }, 250)
}

export function exportIncidentReport(input: IncidentReportInput) {
  downloadIncidentReportMarkdown(input)
  openIncidentReportPrintWindow(input)
}
