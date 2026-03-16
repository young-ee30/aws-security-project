import { TrendingUp, TrendingDown } from 'lucide-react'
import ChartCard from '../common/ChartCard'

interface RpsItem {
  endpoint: string
  rps: number
  trend: 'up' | 'down'
}

interface RpsTableProps {
  data: RpsItem[]
}

export default function RpsTable({ data }: RpsTableProps) {
  return (
    <ChartCard title="Rate — 현재 RPS" subtitle="초당 요청 수">
      <div className="space-y-3">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                index === 0 ? 'bg-yellow-400' :
                index === 1 ? 'bg-green-400' :
                index === 2 ? 'bg-green-500' :
                index === 3 ? 'bg-blue-400' :
                'bg-purple-400'
              }`} />
              <span className="text-sm text-gray-700">{item.endpoint}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{item.rps}</span>
              {item.trend === 'up' ? (
                <TrendingUp className="w-4 h-4 text-rose-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
