import { Server, RefreshCw } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: string[]
  lastUpdated?: string
}

export default function Header({ title, subtitle, breadcrumb = [], lastUpdated }: HeaderProps) {
  void title
  void subtitle
  void lastUpdated

  const currentTime = new Date().toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">DevSecOps</span>
        {breadcrumb.map((item, index) => (
          <span key={index} className="flex items-center gap-2">
            <span className="text-gray-300">{'>'}</span>
            <span className={index === breadcrumb.length - 1 ? "text-gray-900 font-medium" : "text-gray-500"}>
              {item}
            </span>
          </span>
        ))}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Server selector */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
          <Server className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-700">web-server-01</span>
          <span className="text-xs text-gray-400">(10.0.1.10)</span>
        </div>

        {/* Time */}
        <span className="text-sm text-gray-500">{currentTime}</span>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 rounded-full border border-green-200">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-700">LIVE</span>
        </div>
      </div>
    </header>
  )
}

interface PageHeaderProps {
  title: string
  subtitle: string
  lastUpdated?: string
  onRefresh?: () => void
}

export function PageHeader({ title, subtitle, lastUpdated, onRefresh }: PageHeaderProps) {
  void onRefresh

  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>
      {lastUpdated && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <RefreshCw className="w-4 h-4" />
          <span>{lastUpdated} 업데이트</span>
        </div>
      )}
    </div>
  )
}
