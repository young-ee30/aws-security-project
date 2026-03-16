import ChartCard from '../common/ChartCard'

interface MemoryData {
  used: number
  cache: number
  buffer: number
  free: number
  total: number
}

interface MemoryUsageCardProps {
  data: MemoryData
}

export default function MemoryUsageCard({ data }: MemoryUsageCardProps) {
  const items = [
    { label: '사용 중', value: data.used, color: 'bg-indigo-500' },
    { label: '캐시', value: data.cache, color: 'bg-cyan-400' },
    { label: '버퍼', value: data.buffer, color: 'bg-blue-400' },
    { label: '여유', value: data.free, color: 'bg-gray-300' },
  ]

  return (
    <ChartCard title="메모리 구성" subtitle={`총 ${data.total} GB`}>
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{item.label}</span>
              <span className="font-medium text-indigo-600">{item.value} GB</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${item.color} rounded-full`}
                style={{ width: `${(item.value / data.total) * 100}%` }}
              />
            </div>
          </div>
        ))}

        {/* Stacked Bar */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="h-6 flex rounded-lg overflow-hidden">
            <div 
              className="bg-indigo-500" 
              style={{ width: `${(data.used / data.total) * 100}%` }}
            />
            <div 
              className="bg-cyan-400" 
              style={{ width: `${(data.cache / data.total) * 100}%` }}
            />
            <div 
              className="bg-blue-400" 
              style={{ width: `${(data.buffer / data.total) * 100}%` }}
            />
            <div 
              className="bg-green-400" 
              style={{ width: `${(data.free / data.total) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>0 GB</span>
            <span>{data.total} GB</span>
          </div>
        </div>
      </div>
    </ChartCard>
  )
}
