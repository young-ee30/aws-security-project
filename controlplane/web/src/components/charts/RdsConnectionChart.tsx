import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ChartCard from '../common/ChartCard'

interface RdsConnectionChartProps {
  data: Array<{
    time: string
    value: number
  }>
  maxConnections?: number
}

export default function RdsConnectionChart({ data, maxConnections = 500 }: RdsConnectionChartProps) {
  return (
    <ChartCard title="RDS 커넥션" subtitle={`최대 ${maxConnections}개`}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
              domain={[0, maxConnections]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`${Math.round(value)}개`, '커넥션']}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#22d3ee" 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
