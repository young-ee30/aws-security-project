import { cn } from '@/lib/utils'

interface InfoBadgeProps {
  label: string
  value: string
  className?: string
}

export default function InfoBadge({ label, value, className }: InfoBadgeProps) {
  return (
    <div className={cn(
      "px-4 py-3 bg-gray-50 rounded-lg border border-gray-200",
      className
    )}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info'
  text: string
}

export function StatusBadge({ status, text }: StatusBadgeProps) {
  const styles = {
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200'
  }

  return (
    <span className={cn(
      "px-2.5 py-1 text-xs font-medium rounded-md border",
      styles[status]
    )}>
      {text}
    </span>
  )
}
