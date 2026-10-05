import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function loadHandler(name) {
  const source = await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8')
  const executable = source.replace(/import\s*["'][^"']+["'];?/g, '')
    .replace(/import\s*\{\s*withSupabase\s*\}\s*from\s*["'][^"']+["'];?/g, '')
  const module = await import(`data:text/javascript;base64,${Buffer.from('const withSupabase = (_options, handler) => handler;\n' + executable).toString('base64')}`)
  return module.default.fetch
}
function context(profile) {
  return { userClaims: { id: 'test-user' }, supabaseAdmin: { from(name) {
    assert.equal(name, 'profiles', 'Denied callers must not reach league data')
    return { select() { return this }, eq() { return this }, async single() { return { data: profile } } }
  } } }
}
for (const name of ['lolex-league-admin','lolex-league-register']) {
  test(`${name}: unapproved members and staff cannot read or mutate leagues`, async () => {
    const handler = await loadHandler(name)
    for (const role of ['member','staff','superadmin']) {
      for (const status of ['pending','suspended']) {
        for (const method of ['GET','POST','PATCH','DELETE']) {
          const response = await handler(new Request('https://example.invalid', { method }), context({ role, status }))
          assert.equal(response.status, 403)
        }
      }
    }
    for (const method of ['GET','DELETE']) {
      const response = await handler(new Request('https://example.invalid', { method }), context({ role:'member', status:'approved' }))
      assert.equal(response.status, 403)
    }
  })
}
