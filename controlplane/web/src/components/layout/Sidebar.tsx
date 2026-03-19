import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Circle,
  Cloud,
  Database,
  FileText,
  PanelLeftClose,
  ScrollText,
  Server,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ServerItem {
  id: string
  name: string
  type: string
  ip: string
  status: 'running' | 'warning' | 'stopped'
}

const servers: ServerItem[] = [
  { id: '1', name: 'web-server-01', type: 't3.medium', ip: '10.0.1.10', status: 'running' },
  { id: '2', name: 'web-server-02', type: 't3.medium', ip: '10.0.2.10', status: 'warning' },
  { id: '3', name: 'worker-01', type: 'c5.large', ip: '10.0.1.20', status: 'running' },
]

interface NavItem {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
}

/** 보안 · 운영 (상단 그룹 — 보안점검 / Git Actions 로그 / 보안 정책) */
const securityOpsItems: NavItem[] = [
  { label: '보안 점검', path: '/security', icon: Shield },
  { label: 'Git Actions 로그', path: '/git-actions', icon: FileText },
  { label: '보안 정책', path: '/policy', icon: ScrollText },
]

/** 인프라 · 관측 (하단 그룹, 위와 간격 분리) */
const infraItems: NavItem[] = [
  { label: '인프라 세부', path: '/infra', icon: Database },
  { label: '앱/HTTP 세부', path: '/app-http', icon: Activity },
  { label: 'AWS 리소스 세부', path: '/aws-resource', icon: Cloud },
]

function NavMenuLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive
            ? 'bg-indigo-50 text-indigo-700 font-medium'
            : 'text-gray-600 hover:bg-gray-50',
        )
      }
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  )
}

const StatusIcon = ({ status }: { status: ServerItem['status'] }) => {
  switch (status) {
    case 'running':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-500" />
    case 'stopped':
      return <Circle className="w-4 h-4 text-gray-400" />
  }
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">O</span>
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-semibold text-gray-900 text-sm">DevSecOps</h1>
              <p className="text-xs text-gray-500">통합 관제 대시보드</p>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
        >
          <PanelLeftClose
            className={cn(
              'w-4 h-4 text-gray-400 transition-transform',
              collapsed && 'rotate-180',
            )}
          />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 px-2 mb-2">
            <Server className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">모니터링 서버</span>
          </div>
          <div className="space-y-1">
            {servers.map((server) => (
              <div
                key={server.id}
                className={cn(
                  'px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  server.id === '1'
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'hover:bg-gray-50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      server.id === '1' ? 'text-indigo-700' : 'text-gray-700',
                    )}
                  >
                    {server.name}
                  </span>
                  <StatusIcon status={server.status} />
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {server.type} · {server.ip}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-2 overflow-y-auto flex flex-col">
        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              보안 · 운영
            </p>
          )}
          {securityOpsItems.map((item) => (
            <NavMenuLink key={item.path} item={item} collapsed={collapsed} />
          ))}
        </div>

        <div
          className={cn('shrink-0 border-t border-gray-100', collapsed ? 'my-4' : 'my-6 mt-8')}
          aria-hidden
        />

        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              인프라 · 관측
            </p>
          )}
          {infraItems.map((item) => (
            <NavMenuLink key={item.path} item={item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-gray-100">
          <div className="flex items-center gap-2 px-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-gray-500">시스템 정상 운영 중</span>
          </div>
        </div>
      )}
    </aside>
  )
}
