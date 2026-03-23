import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import GitActionsPage from './pages/GitActionsPage'
import CicdPage from './pages/CicdPage'
import PolicyPage from './pages/PolicyPage'
import GithubInstalledPage from './pages/GithubInstalledPage'
import GithubCallbackPage from './pages/GithubCallbackPage'

function App() {
  return (
    <Routes>
      <Route path="/settings/github/installed" element={<GithubInstalledPage />} />
      <Route path="/settings/github/callback" element={<GithubCallbackPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/git-actions" replace />} />
        <Route path="cicd" element={<CicdPage />} />
        <Route path="git-actions" element={<GitActionsPage />} />
        <Route path="policy" element={<PolicyPage />} />
      </Route>
    </Routes>
  )
}

export default App
