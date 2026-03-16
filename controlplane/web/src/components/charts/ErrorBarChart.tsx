import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import ChartCard from '../common/ChartCard'

interface ErrorBarChartProps {
  data: Array<{
    endpoint: string
    '4xx': number
    '5xx': number
  }>
}

export default function ErrorBarChart({ data }: ErrorBarChartProps) {
  return (
    <ChartCard title="Error — 4xx / 5xx 분리" subtitle="분당 에러 건수">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis 
              dataKey="endpoint" 
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
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
              iconType="square"
              iconSize={10}
            />
            <Bar dataKey="4xx" fill="#fbbf24" radius={[4, 4, 0, 0]} name="4xx" />
            <Bar dataKey="5xx" fill="#f87171" radius={[4, 4, 0, 0]} name="5xx" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
