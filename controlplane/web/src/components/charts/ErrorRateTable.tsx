import ChartCard from '../common/ChartCard'

interface ErrorRateItem {
  endpoint: string
  '4xx': number
  '5xx': number
  rate: string
}

interface ErrorRateTableProps {
  data: ErrorRateItem[]
}

export default function ErrorRateTable({ data }: ErrorRateTableProps) {
  return (
    <ChartCard title="Error — 엔드포인트별 에러율" subtitle="4xx / 5xx 비율 분석">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-3 px-2 text-xs font-medium text-gray-500">엔드포인트</th>
              <th className="text-right py-3 px-2 text-xs font-medium text-amber-600">4xx</th>
              <th className="text-right py-3 px-2 text-xs font-medium text-rose-600">5xx</th>
              <th className="text-right py-3 px-2 text-xs font-medium text-gray-500">에러율</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} className="border-b border-gray-50 last:border-0">
                <td className="py-3 px-2 text-sm text-gray-700">{item.endpoint}</td>
                <td className="py-3 px-2 text-sm text-right font-medium text-amber-600">{item['4xx']}</td>
                <td className="py-3 px-2 text-sm text-right font-medium text-rose-600">{item['5xx']}</td>
                <td className="py-3 px-2 text-sm text-right text-gray-500">{item.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}
