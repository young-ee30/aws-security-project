import { useState } from 'react'
import { GitBranch, Clock, RefreshCw, Play, ChevronDown, ChevronRight, Copy, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/layout/Header'
import { cn } from '@/lib/utils'
import { pipelineData, securityScanLog } from '@/data/mockData'

export default function GitActionsPage() {
  return (
    <div>
      <PageHeader 
        title="GitHub Actions 로그"
        subtitle="CI/CD 파이프라인 실행 현황 및 정책 관리"
        lastUpdated="오후 2:12:27"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline List */}
        <div className="lg:col-span-1">
          <PipelineList />
        </div>

        {/* Log Detail */}
        <div className="lg:col-span-2">
          <LogDetail />
        </div>
      </div>

      {/* Add Policy Card */}
      <div className="mt-6">
        <AddPolicyCard />
      </div>
    </div>
  )
}

function PipelineList() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-700">4개 실행</span>
        <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-3.5 h-3.5" />
          새로고침
        </button>
      </div>

      <div className="space-y-3">
        {pipelineData.map((pipeline) => (
          <PipelineItem key={pipeline.id} pipeline={pipeline} />
        ))}
      </div>
    </div>
  )
}

interface Pipeline {
  id: string
  name: string
  status: 'success' | 'failed' | 'running'
  description: string
  branch: string
  commit: string
  duration: string
  time: string
  author: string
}

function PipelineItem({ pipeline }: { pipeline: Pipeline }) {
  const statusColors = {
    success: 'bg-green-500',
    failed: 'bg-red-500',
    running: 'bg-blue-500 animate-pulse',
  }

  const statusLabels = {
    success: { bg: 'bg-green-100', text: 'text-green-700', label: '성공' },
    failed: { bg: 'bg-red-100', text: 'text-red-700', label: '실패' },
    running: { bg: 'bg-blue-100', text: 'text-blue-700', label: '실행중' },
  }

  const config = statusLabels[pipeline.status]

  return (
    <div className="p-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer transition-colors">
      <div className="flex items-start gap-3">
        <div className={cn("w-2 h-2 rounded-full mt-2", statusColors[pipeline.status])} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">{pipeline.name}</span>
            <span className={cn("px-2 py-0.5 text-xs font-medium rounded", config.bg, config.text)}>
              {config.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">{pipeline.description}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              <span>{pipeline.branch}</span>
            </div>
            <span>#</span>
            <span>{pipeline.commit}</span>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{pipeline.duration}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">{pipeline.time} · {pipeline.author}</p>
        </div>
      </div>
    </div>
  )
}

function LogDetail() {
  const [expandedSteps, setExpandedSteps] = useState<string[]>(['Docker 이미지 빌드', 'Trivy 보안 스캔'])

  const toggleStep = (stepName: string) => {
    setExpandedSteps(prev => 
      prev.includes(stepName) 
        ? prev.filter(s => s !== stepName)
        : [...prev, stepName]
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{securityScanLog.title}</h3>
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">실패</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{securityScanLog.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              <span>{securityScanLog.branch}</span>
            </div>
            <span># {securityScanLog.commit}</span>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{securityScanLog.duration}</span>
            </div>
            <span>{securityScanLog.author}</span>
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200">
          <Play className="w-3.5 h-3.5" />
          재실행
        </button>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {securityScanLog.steps.map((step, index) => (
          <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
            <button 
              onClick={() => toggleStep(step.name)}
              className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSteps.includes(step.name) ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  step.status === 'running' ? 'bg-blue-500' :
                  step.status === 'failed' ? 'bg-red-500' :
                  'bg-green-500'
                )} />
                <span className={cn(
                  "text-sm font-medium",
                  step.status === 'failed' ? 'text-red-700' : 'text-gray-700'
                )}>
                  {step.name}
                </span>
              </div>
              <span className="text-xs text-gray-400">{step.duration}</span>
            </button>

            {expandedSteps.includes(step.name) && step.logs && (
              <div className="p-4 bg-gray-900 font-mono text-xs">
                {step.logs.map((log, logIndex) => (
                  <div key={logIndex} className={cn(
                    "py-0.5",
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'critical' ? 'text-red-400' :
                    log.type === 'high' ? 'text-amber-400' :
                    'text-gray-300'
                  )}>
                    {log.text}
                  </div>
                ))}
                
                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-700">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-300 bg-indigo-900/50 hover:bg-indigo-900 rounded-lg transition-colors">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI 도움 받기
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                    로그 복사
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AddPolicyCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <span className="text-indigo-600 text-lg">+</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">새 정책 추가하기</h3>
            <p className="text-xs text-gray-500 mt-0.5">{'PDF 보안 정책 → AI 변환 → Checkov YAML 자동 생성'}</p>
          </div>
        </div>
        <ChevronDown className="w-5 h-5 text-gray-400" />
      </div>
    </div>
  )
}
