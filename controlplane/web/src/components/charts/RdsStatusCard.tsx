import ChartCard from '../common/ChartCard'

interface RdsInfo {
  readLatency: number
  writeLatency: number
  activeConnections: number
  maxConnections: number
  engine: string
  multiAZ: boolean
  autoBackup: string
}

interface RdsStatusCardProps {
  data: RdsInfo
}

export default function RdsStatusCard({ data }: RdsStatusCardProps) {
  const items = [
    { label: 'Read 지연', value: `${data.readLatency} ms`, color: 'text-indigo-600' },
    { label: 'Write 지연', value: `${data.writeLatency} ms`, color: 'text-indigo-600' },
    { label: '활성 커넥션', value: `${data.activeConnections} / ${data.maxConnections}`, color: 'text-indigo-600' },
    { label: '엔진', value: data.engine, color: 'text-indigo-600' },
    { label: '멀티 AZ', value: data.multiAZ ? '활성화' : '비활성화', color: data.multiAZ ? 'text-green-600' : 'text-gray-600' },
    { label: '자동 백업', value: data.autoBackup, color: 'text-indigo-600' },
  ]

  return (
    <ChartCard title="RDS 상태 요약" subtitle="db.t3.large · MySQL 8.0">
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
            <span className="text-sm text-gray-600">{item.label}</span>
            <span className={`text-sm font-medium ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
