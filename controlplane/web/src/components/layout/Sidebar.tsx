import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  FileText,
  PanelLeftClose,
  ScrollText,
  Server,
} from 'lucide-react'
import { cn } from '@/lib/utils'


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
const infraItems: NavItem[] = []

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
