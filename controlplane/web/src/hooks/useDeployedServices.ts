import { useState, useEffect } from 'react'

const BASE = (import.meta as any).env?.VITE_DASHBOARD_URL ?? 'http://localhost:4000'

const REFRESH_MS = 60_000

export interface EcsTaskDetail {
  task_id: string
  last_status: string | null
  health_status: string | null
  launch_type: string | null
  availability_zone: string | null
  task_definition: string | null
  task_cpu: string | null
  task_memory: string | null
  container_name: string | null
  image: string | null
  images: string[]
  private_ip: string | null
}

/** ECS 서비스 한 줄 — running_count 가 0이어도 목록에 포함됨 */
export interface DeployedServiceRow {
  id: string
  label: string
  full_name: string
  cluster: string
  status: string
  running_count: number
  tasks: EcsTaskDetail[]
}

export interface DeployedServicesPayload {
  region: string
  name_prefix: string
  cluster: string
  services: DeployedServiceRow[]
}

export function useDeployedServices() {
  const [data, setData] = useState<DeployedServicesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`${BASE}/dashboard/services`)
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const detail = typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`
          throw new Error(detail)
        }
        const json = (await res.json()) as DeployedServicesPayload
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '연결 실패')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return { data, loading, error }
}
