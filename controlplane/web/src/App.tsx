import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import AppHttpPage from './pages/AppHttpPage'
import InfraPage from './pages/InfraPage'
import AwsResourcePage from './pages/AwsResourcePage'
import LogsMetricsPage from './pages/LogsMetricsPage'
import SecurityPage from './pages/SecurityPage'
import GitActionsPage from './pages/GitActionsPage'
import CicdPage from './pages/CicdPage'
import PolicyPage from './pages/PolicyPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/app-http" replace />} />
        <Route path="app-http" element={<AppHttpPage />} />
        <Route path="infra" element={<InfraPage />} />
        <Route path="aws-resource" element={<AwsResourcePage />} />
        <Route path="logs-metrics" element={<LogsMetricsPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="cicd" element={<CicdPage />} />
        <Route path="git-actions" element={<GitActionsPage />} />
        <Route path="policy" element={<PolicyPage />} />
      </Route>
    </Routes>
  )
}

export default App
