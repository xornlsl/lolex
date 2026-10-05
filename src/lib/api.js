const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
let refreshPromise = null

function clearSession() {
  localStorage.removeItem('lolex_access_token')
  localStorage.removeItem('lolex_refresh_token')
  localStorage.removeItem('lolex_user')
  window.dispatchEvent(new CustomEvent('lolex:session-expired'))
}

function tokenExpiresSoon(token, marginSeconds = 60) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded))
    return !payload.exp || payload.exp <= Math.floor(Date.now() / 1000) + marginSeconds
  } catch {
    return true
  }
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('lolex_refresh_token')
    if (!refreshToken) {
      clearSession()
      throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.')
    }
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    const session = await response.json().catch(() => null)
    if (!response.ok || !session?.access_token || !session?.refresh_token) {
      clearSession()
      throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.')
    }
    localStorage.setItem('lolex_access_token', session.access_token)
    localStorage.setItem('lolex_refresh_token', session.refresh_token)
    return session.access_token
  })().finally(() => { refreshPromise = null })
  return refreshPromise
}

async function validAccessToken(forceRefresh = false) {
  const token = localStorage.getItem('lolex_access_token')
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.')
  return forceRefresh || tokenExpiresSoon(token) ? refreshAccessToken() : token
}

export async function authenticatedFetch(input, init = {}) {
  const request = async forceRefresh => {
    const token = await validAccessToken(forceRefresh)
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('apikey', supabaseKey)
    return fetch(input, { ...init, headers })
  }
  let response = await request(false)
  if (response.status === 401) response = await request(true)
  return response
}

export async function apiRequest(endpoint, { method = 'GET', body, signal } = {}) {
  const headers = {
    apikey: supabaseKey,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await authenticatedFetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
    method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.success === false || !data) {
    throw new Error(data?.error || data?.message || '요청을 처리하지 못했습니다. 다시 시도해주세요.')
  }
  return data
}
