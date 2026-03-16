import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  className?: string
  valueColor?: 'default' | 'blue' | 'orange' | 'red' | 'green'
}

export default function MetricCard({ 
  title, 
  value, 
  unit, 
  className,
  valueColor = 'default' 
}: MetricCardProps) {
  const colorClasses = {
    default: 'text-gray-900',
    blue: 'text-blue-600',
    orange: 'text-amber-600',
    red: 'text-red-600',
    green: 'text-green-600'
  }

  return (
    <div className={cn(
      "bg-white rounded-xl border border-gray-200 p-5",
      className
    )}>
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-3xl font-bold", colorClasses[valueColor])}>
          {value}
        </span>
        {unit && (
          <span className="text-sm text-gray-500">{unit}</span>
        )}
      </div>
    </div>
  )
}
