import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import ChartCard from '../common/ChartCard'

interface NetworkChartProps {
  data: Array<{
    time: string
    in: number
    out: number
  }>
}

export default function NetworkChart({ data }: NetworkChartProps) {
  return (
    <ChartCard title="네트워크 In/Out" subtitle="Mbps">
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
              tickFormatter={(value) => `${value} M`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`${value.toFixed(1)} Mbps`, '']}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
              iconType="circle"
              iconSize={8}
            />
            <Line 
              type="monotone" 
              dataKey="in" 
              stroke="#f59e0b" 
              strokeWidth={2}
              dot={false}
              name="In"
            />
            <Line 
              type="monotone" 
              dataKey="out" 
              stroke="#22d3ee" 
              strokeWidth={2}
              dot={false}
              name="Out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
