import { ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/Header'
import InfoBadge from '@/components/common/InfoBadge'
import { StatusBadge } from '@/components/common/InfoBadge'
import CpuUsageChart from '@/components/charts/CpuUsageChart'
import NetworkChart from '@/components/charts/NetworkChart'
import RdsStatusCard from '@/components/charts/RdsStatusCard'
import RdsLatencyChart from '@/components/charts/RdsLatencyChart'
import RdsConnectionChart from '@/components/charts/RdsConnectionChart'
import { ec2Info, cpuUsageData, networkData, rdsInfo, rdsLatencyData, rdsConnectionData } from '@/data/mockData'

export default function AwsResourcePage() {
  return (
    <div>
      <PageHeader 
        title="AWS 리소스 모니터링"
        subtitle="EC2 · RDS · ELB 세부 메트릭"
        lastUpdated="오후 2:11:49"
      />

      {/* EC2 Instance Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">EC2 인스턴스 메트릭</h3>
            <p className="text-xs text-gray-500 mt-0.5">인스턴스를 선택하여 세부 메트릭 확인</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              <span>web-server-01</span>
              <span className="text-xs text-gray-400">(t3.medium)</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* EC2 Info Badges */}
        <div className="flex flex-wrap gap-3 mb-6">
          <InfoBadge label="ID" value={ec2Info.id} />
          <InfoBadge label="타입" value={ec2Info.type} />
          <InfoBadge label="가용 영역" value={ec2Info.region} />
          <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">상태</p>
            <StatusBadge status="success" text={ec2Info.status} />
          </div>
        </div>

        {/* EC2 Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CpuUsageChart data={cpuUsageData} currentValue={36.3} />
          <NetworkChart data={networkData} />
        </div>
      </div>

      {/* RDS Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <RdsStatusCard data={rdsInfo} />
        <RdsLatencyChart data={rdsLatencyData} />
        <RdsConnectionChart data={rdsConnectionData} />
      </div>

      {/* ELB Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ElbRequestCard />
        <ElbTargetHealthCard />
      </div>
    </div>
  )
}

// ELB Request Card
function ElbRequestCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">ELB 요청 수</h3>
          <p className="text-xs text-gray-500 mt-0.5">Application Load Balancer · req/min</p>
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
        ELB 요청 차트 영역
      </div>
    </div>
  )
}

// ELB Target Health Card
function ElbTargetHealthCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">ELB 타겟 헬스</h3>
          <p className="text-xs text-gray-500 mt-0.5">3/4 정상</p>
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
        타겟 헬스 차트 영역
      </div>
    </div>
  )
}
