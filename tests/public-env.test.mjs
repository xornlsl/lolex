import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePublicEnv } from '../scripts/public-env.mjs'

const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_testvalue' }
const jwt = role => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'testsignature'].join('.')
test('accepts browser-safe publishable and anon keys', () => {
  assert.deepEqual(validatePublicEnv(env), [])
  assert.deepEqual(validatePublicEnv({ ...env, VITE_SUPABASE_ANON_KEY: jwt('anon') }), [])
})
test('blocks missing settings and privileged credentials without echoing them', () => {
  assert.equal(validatePublicEnv({}).length, 2)
  for (const key of ['sb_secret_sensitivetest', jwt('service_role'), jwt('authenticated')]) {
    const errors = validatePublicEnv({ ...env, VITE_SUPABASE_ANON_KEY: key })
    assert(errors.length > 0)
    assert(!errors.join('\n').includes(key))
  }
  assert(validatePublicEnv({ ...env, VITE_OTHER: jwt('service_role') }).length > 0)
  assert(validatePublicEnv({ ...env, VITE_DB_PASSWORD: 'test-password' }).length > 0)
})
test('rejects insecure, placeholder, credential-bearing and malformed URLs', () => {
  for (const url of ['http://example.supabase.co', 'https://YOUR_PROJECT_REF.supabase.co', 'https://user:password@example.com', 'https://example.com/?secret=value', 'broken']) {
    assert(validatePublicEnv({ ...env, VITE_SUPABASE_URL: url }).length > 0)
  }
})
