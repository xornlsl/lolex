// Never include environment values in diagnostics: this also handles accidental secrets.
export function validatePublicEnv(env) {
  const errors = []
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || /YOUR_PROJECT_REF/i.test(parsed.hostname)) throw new Error('invalid')
  } catch { errors.push('VITE_SUPABASE_URL: configure the HTTPS Supabase project URL.') }
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key || '')
  if (!publicKey && key?.startsWith('eyJ')) {
    try {
      const parts = key.split('.')
      publicKey = parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon'
    } catch { publicKey = false }
  }
  if (!publicKey) errors.push('VITE_SUPABASE_ANON_KEY: use a publishable key or legacy anon key, never a secret/service_role key.')
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue
    let privilegedJwt = false
    try { privilegedJwt = JSON.parse(Buffer.from(String(value).split('.')[1] || '', 'base64url').toString()).role === 'service_role' } catch { /* Not a JWT. */ }
    if (/(SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN)/i.test(name) || /sb_secret_|-----BEGIN .*PRIVATE KEY-----/.test(String(value)) || privilegedJwt) {
      errors.push(`${name}: server credentials must not be exposed to the browser.`)
    }
  }
  return errors
}
