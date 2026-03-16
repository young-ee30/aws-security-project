import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ChartCard from '../common/ChartCard'

interface MemoryTrendChartProps {
  data: Array<{
    time: string
    value: number
  }>
}

export default function MemoryTrendChart({ data }: MemoryTrendChartProps) {
  return (
    <ChartCard title="메모리 사용률 추이" subtitle="실시간 사용률 (%)">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
              </linearGradient>
            </defs>
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
              domain={[40, 85]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, '메모리 사용률']}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#a78bfa" 
              strokeWidth={2}
              fill="url(#memoryGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
