import React from 'react'
import { NavLink } from 'react-router-dom'
import { FileText, Gauge, PanelLeftClose, ScrollText, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import DeployedServicesPanel from './DeployedServicesPanel'

interface NavItem {
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
}

/** 보안 · 운영 (상단 그룹 — GitHub Actions 로그 / 보안 정책) */
const securityOpsItems: NavItem[] = [
  { label: 'GitHub Actions 로그', path: '/git-actions', icon: FileText },
  { label: '보안 정책', path: '/policy', icon: ScrollText },
]

/** 인프라 · 관측 (하단 그룹, 위와 간격 분리) */
const infraItems: NavItem[] = [
  { label: '관제', path: '/incident/gwanje', icon: Gauge },
  { label: '침해', path: '/incident/hae', icon: Siren },
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
            : 'text-gray-700 hover:bg-gray-50',
        )
      }
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  )
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
      <div className="h-14 flex items-center px-4 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">O</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-semibold text-gray-900 text-sm">DevSecOps</h1>
              <p className="text-xs text-gray-600">통합 관제 대시보드</p>
            </div>
          )}
        </div>
      </div>

      {!collapsed && <DeployedServicesPanel />}

      <nav className="flex-1 px-3 py-2 overflow-y-auto flex flex-col min-h-0">
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
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              인프라 · 관측
            </p>
          )}
          {infraItems.map((item) => (
            <NavMenuLink key={item.path} item={item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      <div className="p-3 border-t border-gray-100 shrink-0">
        <div
          className={cn(
            'flex items-center gap-2 min-w-0',
            collapsed ? 'justify-center' : 'justify-between px-1',
          )}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <span className="text-xs text-gray-600 leading-tight truncate">시스템 정상 운영 중</span>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors shrink-0 text-gray-500 hover:text-gray-700"
            title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            <PanelLeftClose
              className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')}
            />
          </button>
        </div>
      </div>
    </aside>
  )
}
