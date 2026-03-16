import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageMeta: Record<string, { title: string; breadcrumb: string[] }> = {
  '/app-http': { title: '앱/HTTP 세부 모니터링', breadcrumb: ['앱/HTTP 세부 모니터링'] },
  '/infra': { title: '인프라 세부 모니터링', breadcrumb: ['인프라 세부 모니터링'] },
  '/aws-resource': { title: 'AWS 리소스 모니터링', breadcrumb: ['AWS 리소스 모니터링'] },
  '/security': { title: '보안 점검', breadcrumb: ['보안 점검'] },
  '/git-actions': { title: 'GitHub Actions 로그', breadcrumb: ['GitHub Actions 로그'] },
}

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const meta = pageMeta[location.pathname] || { title: '대시보드', breadcrumb: [] }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          title={meta.title}
          breadcrumb={meta.breadcrumb}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
