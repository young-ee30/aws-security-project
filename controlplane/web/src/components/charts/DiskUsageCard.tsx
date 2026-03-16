import ChartCard from '../common/ChartCard'

interface DiskItem {
  mount: string
  used: number
  total: number
  percentage: number
}

interface DiskUsageCardProps {
  data: DiskItem[]
}

export default function DiskUsageCard({ data }: DiskUsageCardProps) {
  return (
    <ChartCard title="디스크 마운트별 용량" subtitle="파티션 사용 현황">
      <div className="space-y-4">
        {data.map((disk, index) => (
          <div key={index} className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-700">{disk.mount}</span>
              <span className="text-sm font-medium text-indigo-600">
                {disk.used}/{disk.total} GB ({disk.percentage}%)
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  disk.percentage >= 80 ? 'bg-red-500' :
                  disk.percentage >= 60 ? 'bg-amber-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${disk.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
