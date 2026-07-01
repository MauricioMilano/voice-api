import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import ApiKeys from './pages/ApiKeys'
import Usage from './pages/Usage'
import Docs from './pages/Docs'
import Playground from './pages/Playground'

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-400">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/keys" element={<ApiKeys />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/docs" element={<Docs />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
