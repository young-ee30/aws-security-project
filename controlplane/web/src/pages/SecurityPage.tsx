import { PageHeader } from '@/components/layout/Header'
import ChartCard from '@/components/common/ChartCard'

export default function SecurityPage() {
  return (
    <div>
      <PageHeader 
        title="보안 점검"
        subtitle="취약점 스캔 및 보안 정책 관리"
        lastUpdated="오후 2:12:15"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="보안 취약점 현황" subtitle="심각도별 분류">
          <div className="space-y-4">
            <VulnerabilityItem severity="critical" count={2} label="Critical" />
            <VulnerabilityItem severity="high" count={5} label="High" />
            <VulnerabilityItem severity="medium" count={12} label="Medium" />
            <VulnerabilityItem severity="low" count={28} label="Low" />
          </div>
        </ChartCard>

        <ChartCard title="최근 스캔 결과" subtitle="마지막 스캔: 10분 전">
          <div className="space-y-3">
            <ScanResultItem 
              name="Trivy 컨테이너 스캔" 
              status="failed" 
              issues={7} 
            />
            <ScanResultItem 
              name="OWASP Dependency Check" 
              status="warning" 
              issues={3} 
            />
            <ScanResultItem 
              name="SonarQube 코드 분석" 
              status="success" 
              issues={0} 
            />
            <ScanResultItem 
              name="Checkov IaC 스캔" 
              status="success" 
              issues={0} 
            />
          </div>
        </ChartCard>
      </div>

      <ChartCard title="보안 정책 준수 현황" subtitle="AWS Security Hub 기준">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ComplianceCard title="CIS AWS Benchmark" score={87} />
          <ComplianceCard title="AWS Best Practices" score={94} />
          <ComplianceCard title="PCI DSS" score={78} />
          <ComplianceCard title="SOC 2" score={91} />
        </div>
      </ChartCard>
    </div>
  )
}

interface VulnerabilityItemProps {
  severity: 'critical' | 'high' | 'medium' | 'low'
  count: number
  label: string
}

function VulnerabilityItem({ severity, count, label }: VulnerabilityItemProps) {
  const colors = {
    critical: { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-100' },
    high: { bg: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-100' },
    medium: { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-100' },
    low: { bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-100' },
  }

  const color = colors[severity]

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${color.bg}`} />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <span className={`px-2 py-1 text-sm font-medium rounded ${color.light} ${color.text}`}>
        {count}
      </span>
    </div>
  )
}

interface ScanResultItemProps {
  name: string
  status: 'success' | 'warning' | 'failed'
  issues: number
}

function ScanResultItem({ name, status, issues }: ScanResultItemProps) {
  const statusConfig = {
    success: { bg: 'bg-green-100', text: 'text-green-700', label: '통과' },
    warning: { bg: 'bg-amber-100', text: 'text-amber-700', label: '경고' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', label: '실패' },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-700">{name}</span>
      <div className="flex items-center gap-3">
        {issues > 0 && (
          <span className="text-xs text-gray-500">{issues}개 이슈</span>
        )}
        <span className={`px-2 py-1 text-xs font-medium rounded ${config.bg} ${config.text}`}>
          {config.label}
        </span>
      </div>
    </div>
  )
}

interface ComplianceCardProps {
  title: string
  score: number
}

function ComplianceCard({ title, score }: ComplianceCardProps) {
  const getColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 80) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <p className="text-xs text-gray-500 mb-2">{title}</p>
      <p className={`text-2xl font-bold ${getColor(score)}`}>{score}%</p>
    </div>
  )
}
