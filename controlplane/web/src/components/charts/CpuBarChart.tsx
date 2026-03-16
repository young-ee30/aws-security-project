import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import ChartCard from '../common/ChartCard'

interface CpuBarChartProps {
  data: Array<{
    core: string
    user: number
    system: number
    iowait: number
  }>
}

export default function CpuBarChart({ data }: CpuBarChartProps) {
  return (
    <ChartCard title="CPU 코어별 사용률" subtitle="평균 56.5% — web-server-01">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            layout="vertical"
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={true} vertical={false} />
            <XAxis 
              type="number"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis 
              type="category"
              dataKey="core"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
              width={50}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`${value}%`, '']}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
              iconType="square"
              iconSize={10}
            />
            <Bar dataKey="user" stackId="a" fill="#60a5fa" name="user" />
            <Bar dataKey="system" stackId="a" fill="#34d399" name="system" />
            <Bar dataKey="iowait" stackId="a" fill="#a78bfa" name="iowait" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
