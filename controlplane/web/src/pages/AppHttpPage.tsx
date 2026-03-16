import { PageHeader } from '@/components/layout/Header'
import MetricCard from '@/components/common/MetricCard'
import RpsTable from '@/components/charts/RpsTable'
import RequestTrendChart from '@/components/charts/RequestTrendChart'
import ErrorBarChart from '@/components/charts/ErrorBarChart'
import ErrorRateTable from '@/components/charts/ErrorRateTable'
import { rpsData, requestTrendData, errorBarData, errorRateData } from '@/data/mockData'

export default function AppHttpPage() {
  return (
    <div>
      <PageHeader 
        title="앱/HTTP 세부 모니터링"
        subtitle="RED 방식 — Rate · Error · Duration"
        lastUpdated="오후 2:10:25"
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard 
          title="전체 초당 요청" 
          value={451} 
          unit="req/s"
        />
        <MetricCard 
          title="HTTP 4xx 에러" 
          value={131} 
          unit="/min"
          valueColor="orange"
        />
        <MetricCard 
          title="HTTP 5xx 에러" 
          value={35} 
          unit="/min"
          valueColor="red"
        />
      </div>

      {/* Rate Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <RpsTable data={rpsData} />
        <div className="lg:col-span-2">
          <RequestTrendChart data={requestTrendData} />
        </div>
      </div>

      {/* Error Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ErrorBarChart data={errorBarData} />
        <ErrorRateTable data={errorRateData} />
      </div>

      {/* Duration Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DurationHistogram />
        <DurationSLOComparison />
      </div>
    </div>
  )
}

// Duration Histogram Component
function DurationHistogram() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Duration — P50/P95/P99</h3>
          <p className="text-xs text-gray-500 mt-0.5">응답 시간 히스토그램 (ms)</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200">
            다운로드
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200">
            AI 도움
          </button>
        </div>
      </div>
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        Duration 차트 영역
      </div>
    </div>
  )
}

// Duration SLO Comparison Component
function DurationSLOComparison() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Duration — SLO 기준 비교</h3>
          <p className="text-xs text-gray-500 mt-0.5">엔드포인트별 응답 시간 상세</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200">
            다운로드
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200">
            AI 도움
          </button>
        </div>
      </div>
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        SLO 비교 차트 영역
      </div>
    </div>
  )
}
