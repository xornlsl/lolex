import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function handler() {
  const source = await readFile(new URL('../supabase/functions/lolex-admin-management/index.ts', import.meta.url), 'utf8')
  const executable = source.replace(/import\s*\{\s*withSupabase\s*\}\s*from\s*["'][^"']+["'];?/g, '')
  return (await import(`data:text/javascript;base64,${Buffer.from('const withSupabase = (_options, handler) => handler;\n' + executable).toString('base64')}`)).default.fetch
}

function query(result) {
  return new Proxy({}, { get: (_target, key) => key === 'then'
    ? (resolve => resolve(result))
    : () => query(result) })
}

function context({ targetStatus='approved', activeMatch=null } = {}) {
  const writes = []
  const admin = {
    from(table) {
      if (table === 'profiles') {
        let update
        return new Proxy({}, { get: (_target, key) => {
          if (key === 'then') return resolve => resolve({ data: null, error: null })
          if (key === 'update') return changes => { update=changes; writes.push([table,'update',changes]); return query({ error:null }) }
          if (key === 'select') return () => ({ eq: (_column,value) => ({ maybeSingle: async () => ({ data: value === 'admin' ? { role:'superadmin',status:'approved' } : { role:'member',status:targetStatus }, error:null }) }) })
          return () => query({ error:null, update })
        } })
      }
      if (table === 'match_players') return query({ data:activeMatch, error:null })
      if (table === 'match_queue') return { delete: () => ({ eq: async () => { writes.push([table,'delete']); return { error:null } } }) }
      throw new Error(`Unexpected table: ${table}`)
    },
    auth:{ admin:{
      async deleteUser() { writes.push(['auth','delete']); return { error:null } },
      async updateUserById(_id, changes) { writes.push(['auth','ban',changes]); return { error:null } },
    } },
  }
  return { ctx:{ userClaims:{ id:'admin' },supabaseAdmin:admin },writes }
}

test('approved member with history is suspended and banned without deleting their account', async () => {
  const fetch = await handler()
  const { ctx,writes } = context()
  const response = await fetch(new Request('https://example.invalid', { method:'PATCH',body:JSON.stringify({ user_id:'11111111-1111-1111-1111-111111111111',action:'kick' }) }),ctx)
  assert.equal(response.status,200)
  assert.equal((await response.json()).history_preserved,true)
  assert.deepEqual(writes,[['profiles','update',{status:'suspended'}],['match_queue','delete'],['auth','ban',{ban_duration:'876000h'}]])
})

test('member in another active match cannot be kicked', async () => {
  const fetch = await handler()
  const { ctx,writes } = context({ activeMatch:{ match_id:42,matches:{status:'matched'} } })
  const response = await fetch(new Request('https://example.invalid', { method:'PATCH',body:JSON.stringify({ user_id:'11111111-1111-1111-1111-111111111111',action:'kick' }) }),ctx)
  assert.equal(response.status,409)
  assert.deepEqual(writes,[])
})

test('pending signup rejection still removes its unused auth account', async () => {
  const fetch = await handler()
  const { ctx,writes } = context({ targetStatus:'pending' })
  const response = await fetch(new Request('https://example.invalid', { method:'PATCH',body:JSON.stringify({ user_id:'11111111-1111-1111-1111-111111111111',action:'kick' }) }),ctx)
  assert.equal(response.status,200)
  assert.deepEqual(writes,[['auth','delete']])
})
