import React from 'react'

/** 전체 로그/메트릭에서 분리한 차트 블록용 */
export default class LogsMetricsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 렌더링 오류'
    return { hasError: true, message }
  }

  componentDidCatch(err: unknown) {
    console.error('LogsMetrics chart block error:', err)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          차트 영역 렌더 오류: <code className="text-xs">{this.state.message}</code>
        </div>
      )
    }
    return this.props.children
  }
}
