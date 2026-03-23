import { Server } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useDeployedServices, type DeployedServiceRow, type EcsTaskDetail } from '@/hooks/useDeployedServices'

/** 사이드바 높이 — 태스크 상세는 CPU·메모리 큰 순 상위 N개만 */
const MAX_TASKS_SHOWN = 2

function parseTaskCpuMem(t: EcsTaskDetail): { cpu: number; mem: number } {
  const cpu = parseInt(String(t.task_cpu ?? '').replace(/\D/g, ''), 10) || 0
  const mem = parseInt(String(t.task_memory ?? '').replace(/\D/g, ''), 10) || 0
  return { cpu, mem }
}

function taskResourceScore(t: EcsTaskDetail): number {
  const { cpu, mem } = parseTaskCpuMem(t)
  return cpu * 1_000_000 + mem
}

function tasksForSidebar(tasks: EcsTaskDetail[]) {
  if (tasks.length <= MAX_TASKS_SHOWN) return { visible: tasks, rest: 0 }
  const sorted = [...tasks].sort((a, b) => taskResourceScore(b) - taskResourceScore(a))
  return {
    visible: sorted.slice(0, MAX_TASKS_SHOWN),
    rest: tasks.length - MAX_TASKS_SHOWN,
  }
}

function healthTone(row: {
  status: string
  tasks: EcsTaskDetail[]
  running_count: number
}): 'ok' | 'warn' | 'muted' {
  if (row.status !== 'ACTIVE') return 'muted'
  if (row.running_count < 1) return 'muted'
  if (row.tasks.length === 0) return 'ok'
  const anyUnhealthy = row.tasks.some((t) => t.health_status?.toUpperCase() === 'UNHEALTHY')
  if (anyUnhealthy) return 'warn'
  return 'ok'
}

function healthClass(h: string | null) {
  if (!h) return 'text-gray-600'
  const u = h.toUpperCase()
  if (u === 'HEALTHY') return 'text-emerald-600 font-medium'
  if (u === 'UNHEALTHY') return 'text-red-600 font-medium'
  return 'text-gray-700'
}

function TaskSummary({ t, region }: { t: EcsTaskDetail; region: string }) {
  const regionText = t.availability_zone ? `${region} · ${t.availability_zone}` : region

  return (
    <div className="mt-2 rounded-md bg-gray-50/80 px-2.5 py-2 space-y-1.5 text-[11px]">
      <div className="flex justify-between gap-3">
        <span className="text-gray-500 shrink-0">프라이빗 IP</span>
        <span className="text-gray-900 font-mono tabular-nums text-right truncate" title={t.private_ip ?? undefined}>
          {t.private_ip ?? '—'}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-gray-500 shrink-0">리전</span>
        <span className="text-gray-900 text-right leading-snug break-all" title={regionText}>
          {regionText}
        </span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-gray-500 shrink-0">상태</span>
        <span className="text-gray-900 text-right">{t.last_status ?? '—'}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-gray-500 shrink-0">헬스</span>
        <span className={cn('text-right', healthClass(t.health_status))}>{t.health_status ?? '—'}</span>
      </div>
    </div>
  )
}

/** 실행 중 태스크가 1개 이상인 서비스만 사이드바에 표시 */
function runningOnly(services: DeployedServiceRow[]): DeployedServiceRow[] {
  return services.filter((s) => (s.running_count ?? 0) >= 1)
}

export default function DeployedServicesPanel() {
  const { data, loading, error } = useDeployedServices()
  const runningServices = data ? runningOnly(data.services) : []

  return (
    <div className="px-3 py-3 border-b border-gray-100 shrink-0">
      <div className="flex items-center gap-2 px-2 mb-2">
        <Server className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="text-xs font-medium text-gray-700">현재 운영서비스(ECS)</span>
      </div>

      {loading && (
        <div className="space-y-2 px-1">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="px-2 text-[11px] text-red-600 leading-snug">{error}</p>
      )}

      {!loading && !error && data && data.services.length === 0 && (
        <p className="px-2 text-[11px] text-gray-600 leading-snug">
          ECS 서비스 정의가 없습니다.
        </p>
      )}

      {!loading && !error && data && data.services.length > 0 && runningServices.length === 0 && (
        <div className="space-y-2">
          <p className="px-2 text-[11px] text-gray-600 leading-snug">
            실행 중인 ECS 태스크가 없습니다. (스케일 0이거나 미배포 서비스는 목록에서 제외)
          </p>
          <p className="px-2 pt-0.5 text-[10px] text-gray-500 truncate" title={data.cluster}>
            {data.cluster}
          </p>
        </div>
      )}

      {!loading && !error && data && runningServices.length > 0 && (
        <div className="space-y-3">
          {runningServices.map((row) => {
            const tone = healthTone(row)
            const running = row.running_count ?? 0
            const { visible: taskSlice, rest: taskRest } = tasksForSidebar(row.tasks)
            return (
              <Link
                key={row.id}
                to="/monitoring-logs"
                className={cn(
                  'block px-3 py-2 rounded-lg transition-colors border border-transparent',
                  'hover:bg-gray-50 hover:border-gray-100',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{row.label}</span>
                  <span
                    className={cn(
                      'shrink-0 w-2 h-2 rounded-full',
                      tone === 'ok' && 'bg-emerald-500',
                      tone === 'warn' && 'bg-amber-500',
                      tone === 'muted' && 'bg-gray-300',
                    )}
                    title={`${row.status} · running ${running}`}
                  />
                </div>
                {row.tasks.length === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1.5">상세 조회 없음</p>
                )}
                {taskSlice.map((t, ti) => (
                  <TaskSummary key={`${row.id}-${t.task_id}-${ti}`} t={t} region={data.region} />
                ))}
                {taskRest > 0 && (
                  <p className="text-[10px] text-gray-500 mt-1.5 pl-0.5">
                    외 {taskRest}개 태스크 (CPU·메모리 상위 {MAX_TASKS_SHOWN}개만 표시 · 전체는 로그/메트릭)
                  </p>
                )}
              </Link>
            )
          })}
          <p className="px-2 pt-0.5 text-[10px] text-gray-500 truncate" title={data.cluster}>
            {data.cluster}
          </p>
        </div>
      )}
    </div>
  )
}
