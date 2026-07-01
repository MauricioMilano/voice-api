    import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
    import { Auth, clearToken, getToken, setToken, type UserOut } from './api'

    interface AuthState {
      user: UserOut | null
      loading: boolean
login: (email: string, password: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthState | undefined>(undefined)

    export function AuthProvider({ children }: { children: ReactNode }) {
      const [user, setUser] = useState<UserOut | null>(null)
      const [loading, setLoading] = useState(true)

      useEffect(() => {
        const t = getToken()
        if (!t) { setLoading(false); return }
        Auth.me()
          .then(setUser)
          .catch(() => clearToken())
          .finally(() => setLoading(false))
      }, [])

      const login = async (email: string, password: string) => {
        const r = await Auth.login(email, password)
        setToken(r.access_token)
        const u = await Auth.me()
        setUser(u)
      }
      const register = async (email: string, name: string, password: string) => {
        const r = await Auth.register(email, name, password)
        setToken(r.access_token)
        const u = await Auth.me()
        setUser(u)
      }
      const logout = () => { clearToken(); setUser(null) }

      return (
        <Ctx.Provider value={{ user, loading, login, register, logout }}>
          {children}
        </Ctx.Provider>
      )
    }

    export function useAuth() {
      const ctx = useContext(Ctx)
      if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
      return ctx
    }
