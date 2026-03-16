import { Download, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  showActions?: boolean
}

export default function ChartCard({ 
  title, 
  subtitle, 
  children, 
  className,
  showActions = true 
}: ChartCardProps) {
  return (
    <div className={cn(
      "bg-white rounded-xl border border-gray-200 p-5",
      className
    )}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {showActions && (
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">
              <Download className="w-3.5 h-3.5" />
              <span>다운로드</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 도움</span>
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
