import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import ChartCard from '../common/ChartCard'

interface RequestTrendChartProps {
  data: Array<{
    time: string
    users: number
    orders: number
    auth: number
    products: number
    search: number
  }>
}

export default function RequestTrendChart({ data }: RequestTrendChartProps) {
  return (
    <ChartCard title="Rate — 요청 추이 (최근 30분)" subtitle="엔드포인트별 req/s">
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
              tickFormatter={(value) => `${value} r/s`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
              iconType="circle"
              iconSize={8}
            />
            <Line 
              type="monotone" 
              dataKey="users" 
              stroke="#facc15" 
              strokeWidth={2}
              dot={false}
              name="users"
            />
            <Line 
              type="monotone" 
              dataKey="orders" 
              stroke="#4ade80" 
              strokeWidth={2}
              dot={false}
              name="orders"
            />
            <Line 
              type="monotone" 
              dataKey="auth" 
              stroke="#22d3ee" 
              strokeWidth={2}
              dot={false}
              name="auth"
            />
            <Line 
              type="monotone" 
              dataKey="products" 
              stroke="#a78bfa" 
              strokeWidth={2}
              dot={false}
              name="products"
            />
            <Line 
              type="monotone" 
              dataKey="search" 
              stroke="#f472b6" 
              strokeWidth={2}
              dot={false}
              name="search"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
