import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const nav = [
  { to: '/',           label: 'Dashboard',  icon: '📊', end: true },
  { to: '/keys',       label: 'API Keys',   icon: '🔑' },
  { to: '/usage',      label: 'Usage',      icon: '📈' },
  { to: '/billing',    label: 'Billing',    icon: '💎' },
  { to: '/playground', label: 'Playground', icon: '🎙️' },
  { to: '/docs',       label: 'Docs',       icon: '📚' },
]

const adminNav = [
  { to: '/admin/credits', label: 'Admin · Créditos', icon: '🪙' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const onLogout = () => { logout(); navigate('/login') }
  const isAdmin = !!user?.is_admin

  return (
    <div className="min-h-screen flex bg-ink-950 text-zinc-100">
      <aside className="w-60 shrink-0 border-r border-ink-800 bg-ink-900/40 flex flex-col">
        <div className="px-5 py-5 border-b border-ink-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-600 grid place-items-center font-bold">V</div>
            <div>
              <div className="font-semibold leading-tight">VoiceAPI</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Gateway</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ` +
                (isActive
                  ? 'bg-accent-500/10 text-accent-400 border border-accent-500/30'
                  : 'text-zinc-300 hover:bg-ink-800 border border-transparent')
              }
            >
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
          {isAdmin && (
            <>
              <div className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-widest text-zinc-600">Admin</div>
              {adminNav.map(n => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ` +
                    (isActive
                      ? 'bg-accent-500/10 text-accent-400 border border-accent-500/30'
                      : 'text-zinc-300 hover:bg-ink-800 border border-transparent')
                  }
                >
                  <span className="text-base">{n.icon}</span>
                  <span>{n.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="p-3 border-t border-ink-800">
          <div className="px-2 py-2 text-xs text-zinc-400">
            Signed in as <span className="text-zinc-200 font-medium">{user?.email}</span>
            {isAdmin && <span className="ml-1 pill-accent !text-[10px] !py-0">admin</span>}
          </div>
          <button onClick={onLogout} className="btn-secondary w-full">Sign out</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
