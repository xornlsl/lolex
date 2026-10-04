// Uses only the public project key. No credentials or successful registrations.
import assert from 'node:assert/strict'
const base = process.env.VITE_SUPABASE_URL
const apikey = process.env.VITE_SUPABASE_ANON_KEY
if (!base || !apikey) throw new Error('Load .env.local before running the smoke checks')
const payload = {
  username: 'sheet_smoke', password: 'validation-only-2026',
  real_name: `명단불일치검증-${crypto.randomUUID()}`, birth_date: '2000-01-01',
  lol_nickname: '명단불일치검증#TEST', main_position: 'TOP', sub_position: 'MID',
}
for (const score of [51, -1, 1.5, '1e1']) {
  const r = await fetch(`${base}/functions/v1/lolex-signup`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, initial_internal_score: score }) })
  const data = await r.json()
  assert.equal(r.status, 400, `Invalid score must be rejected; got ${r.status}`)
  assert.match(data.error, /0~50/)
}
const r = await fetch(`${base}/functions/v1/lolex-signup`, { method: 'POST', headers: { apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, initial_internal_score: 32 }) })
const data = await r.json()
assert.equal(r.status, 403, `Unlisted identity must be rejected; got ${r.status}`)
assert.match(data.error, /시트 명단/)
for (const endpoint of ['lolex-member-sheet', 'lolex-aliases', 'lolex-admin-management']) {
  const response = await fetch(`${base}/functions/v1/${endpoint}`, { headers: { apikey } })
  assert.equal(response.status, 401, `${endpoint} must require authentication`)
}
console.log('Deployed API smoke checks passed: score bounds, roster mismatch, unauthenticated access.')
