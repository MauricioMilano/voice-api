const TOKEN_KEY = 'voiceapi.jwt'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`)
    this.status = status
    this.detail = detail
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (auth) {
    const t = getToken()
    if (t) headers.set('Authorization', `Bearer ${t}`)
  }
  const res = await fetch(path, { ...init, headers })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

// ---------- Auth ----------
export interface UserOut { id: number; email: string; name: string; is_admin: boolean; created_at: string }
export interface TokenResponse { access_token: string; token_type: 'bearer'; expires_in: number }

export const Auth = {
  register: (email: string, name: string, password: string) =>
    request<TokenResponse>('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email, name, password }),
    }, false),
  login: (email: string, password: string) =>
    request<TokenResponse>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }, false),
  me: () => request<UserOut>('/api/auth/me'),
}

// ---------- Keys ----------
export interface ApiKey {
  id: number
  name: string
  prefix: string
  scopes: string[]
  is_active: boolean
  last_used_at: string | null
  expires_at: string | null
  created_at: string
  revoked_at: string | null
}
export interface ApiKeyCreated extends ApiKey { key: string }

export const Keys = {
  list: () => request<ApiKey[]>('/api/keys'),
  create: (name: string, scopes: string[] = []) =>
    request<ApiKeyCreated>('/api/keys', {
      method: 'POST', body: JSON.stringify({ name, scopes }),
    }),
  revoke: (id: number) =>
    request<void>(`/api/keys/${id}`, { method: 'DELETE' }),
  rotate: (id: number) =>
    request<ApiKeyCreated>(`/api/keys/${id}/rotate`, { method: 'POST' }),
}

// ---------- Usage ----------
export interface UsageSummary {
  total_requests: number
  total_bytes_in: number
  total_bytes_out: number
  total_units: number
  success_count: number
  error_count: number
  per_endpoint: Record<string, number>
}
export interface UsageLog {
  id: number; endpoint: string; status_code: number
  duration_ms: number; bytes_in: number; bytes_out: number
  units: number; error: string | null; created_at: string
}

export const Usage = {
  summary: (days = 30) => request<UsageSummary>(`/api/usage/summary?days=${days}`),
  logs: (limit = 50, offset = 0, endpoint?: string) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (endpoint) p.set('endpoint', endpoint)
    return request<UsageLog[]>(`/api/usage/logs?${p.toString()}`)
  },
}

// ---------- Meta ----------
export interface Meta { service: string; version: string; stt_model: string; docs: string }
export const Meta = {
  get: () => request<Meta>('/api/meta', {}, false),
}

// ---------- Voice (raw, with API key, no JWT) ----------
export const Voice = {
  async stt(apiKey: string, audioBlob: Blob) {
    const form = new FormData()
    form.append('audio', audioBlob, 'recording.webm')
    const res = await fetch('/v1/stt', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: form,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) throw new ApiError(res.status, data)
    return data as { text: string; words: { word: string; start: number; end: number; probability: number }[]; model: string; duration: number | null }
  },
}
