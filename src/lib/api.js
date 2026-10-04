export async function apiRequest(endpoint, { method = 'GET', body, signal } = {}) {
  const token = localStorage.getItem('lolex_access_token')
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.')
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`, {
    method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.success === false || !data) {
    throw new Error(data?.error || data?.message || '요청을 처리하지 못했습니다. 다시 시도해주세요.')
  }
  return data
}
