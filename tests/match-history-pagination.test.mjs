import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function handler() {
  const source = await readFile(new URL('../supabase/functions/lolex-match-history/index.ts', import.meta.url), 'utf8')
  const executable = source.replace(/import\s*\{\s*withSupabase\s*\}\s*from\s*["'][^"']+["'];?/g, '')
  return (await import(`data:text/javascript;base64,${Buffer.from('const withSupabase = (_options, handler) => handler;\n' + executable).toString('base64')}#${Math.random()}`)).default.fetch
}

function context() {
  const calls = { orders: [], range: null, count: null }
  const matches = {
    select(_columns, options) { calls.count = options?.count; return this },
    eq() { return this },
    order(column, options) { calls.orders.push([column, options]); return this },
    async range(from, to) {
      calls.range = [from, to]
      return { data: [{ id: 40, status: 'finished', winner: 'BLUE', created_at: '2026-10-07T00:00:00Z', finished_at: null, replay_games: [], match_players: [] }], error: null, count: 7 }
    },
  }
  const profiles = { select() { return this }, eq() { return this }, async maybeSingle() { return { data: { status: 'approved' }, error: null } } }
  return { ctx: { userClaims: { sub: 'member' }, supabaseAdmin: { from: table => table === 'profiles' ? profiles : matches } }, calls }
}

test('match history returns a counted page in stable newest-first order', async () => {
  const fetch = await handler()
  const { ctx, calls } = context()
  const response = await fetch(new Request('https://example.invalid?page=2&page_size=5'), ctx)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.pagination, { page: 2, page_size: 5, total: 7, total_pages: 2 })
  assert.deepEqual(calls.range, [5, 9])
  assert.equal(calls.count, 'exact')
  assert.deepEqual(calls.orders.map(([column]) => column), ['created_at', 'id'])
})

test('match history rejects invalid page parameters before querying', async () => {
  const fetch = await handler()
  const { ctx, calls } = context()
  const response = await fetch(new Request('https://example.invalid?page=0&page_size=5'), ctx)
  assert.equal(response.status, 400)
  assert.equal(calls.range, null)
})
