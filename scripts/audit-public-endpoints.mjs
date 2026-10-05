// Read-only checks. Print status codes and selected public settings, never keys.
import { loadEnvFile } from 'node:process'
loadEnvFile('.env.local')
const base = process.env.VITE_SUPABASE_URL
const headers = { apikey: process.env.VITE_SUPABASE_ANON_KEY }
const endpoints = ['lolex-admin-member','lolex-admin-members','lolex-admin-management',
  'lolex-member-sheet','lolex-league-admin','lolex-league-register','lolex-queue',
  'lolex-match-positions','lolex-match-result','lolex-replay-result','lolex-match-cancel',
  'lolex-members','lolex-my-profile','lolex-match-history','lolex-aliases','lolex-leagues']
let failed = false
await Promise.all(endpoints.map(async name => {
  const res = await fetch(`${base}/functions/v1/${name}`, { headers, signal: AbortSignal.timeout(15000) })
  console.log(`${name}: unauthenticated ${res.status}`)
  if (res.status !== 401 && res.status !== 403) failed = true
}))
const preflight = await fetch(`${base}/functions/v1/lolex-league-admin`, {
  method: 'OPTIONS', headers: { Origin: 'https://lolex-khaki.vercel.app',
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,apikey,content-type' },
  signal: AbortSignal.timeout(15000),
})
console.log('CORS:', preflight.status, preflight.headers.get('access-control-allow-origin'))
if (!preflight.ok) failed = true
const settingsResponse = await fetch(`${base}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15000) })
if (settingsResponse.ok) {
  const settings = await settingsResponse.json()
  console.log('Public auth settings:', JSON.stringify({ disable_signup: settings.disable_signup,
    mailer_autoconfirm: settings.mailer_autoconfirm, email: settings.external?.email,
    anonymous: settings.external?.anonymous_users }))
} else console.log('Auth settings:', settingsResponse.status)
process.exitCode = failed ? 1 : 0
