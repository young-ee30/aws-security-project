import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ChartCard from '../common/ChartCard'

interface CpuUsageChartProps {
  data: Array<{
    time: string
    value: number
  }>
  currentValue?: number
}

export default function CpuUsageChart({ data, currentValue }: CpuUsageChartProps) {
  return (
    <ChartCard title="CPU 사용률" subtitle="web-server-01 (%)">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
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
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'CPU']}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#6366f1" 
              strokeWidth={2}
              fill="url(#cpuGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {currentValue && (
        <div className="text-right mt-2">
          <span className="text-sm text-gray-500">현재 </span>
          <span className="text-sm font-semibold text-indigo-600">{currentValue}%</span>
        </div>
      )}
    </ChartCard>
  )
}
