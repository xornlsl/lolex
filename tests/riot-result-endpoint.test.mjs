import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { members, participants, champions, matchData } from './fixtures/riot-match.mjs'

async function handler() {
  const source = await readFile(new URL('../supabase/functions/lolex-replay-result/index.ts', import.meta.url), 'utf8')
  const executable = stripTypeScriptTypes(source
    .replace(/import \{ withSupabase \} from '[^']+';/, 'const withSupabase = (_options, handler) => handler;')
    .replace("'../../../src/lib/replay.js'", JSON.stringify(new URL('../src/lib/replay.js', import.meta.url).href))
    .replace("'../_shared/riot-match.js'", JSON.stringify(new URL('../supabase/functions/_shared/riot-match.js', import.meta.url).href)))
  return (await import(`data:text/javascript;base64,${Buffer.from("const Deno = { env: { get: name => name === 'RIOT_API_KEY' ? 'test-key' : 'asia' } };\n" + executable).toString('base64')}#${Math.random()}`)).default.fetch
}

function context({ caller = 'user-0', approved = true, status = 'matched', duplicates = [], rpcError = null } = {}) {
  const writes = []
  const db = {
    from(table) {
      let single = false
      const query = new Proxy({}, { get: (_, method) => {
        if (method === 'then') return resolve => {
          const data = table === 'profiles' ? single ? { role: 'member', status: approved ? 'approved' : 'pending' } : members.map(m => ({ ...m, profile_aliases: m.aliases.map(lol_nickname => ({ lol_nickname })) }))
            : table === 'matches' ? { status } : table === 'match_players' ? participants : table === 'replay_games' ? duplicates : null
          resolve({ data, error: null })
        }
        return () => { if (method === 'maybeSingle') single = true; return query }
      } })
      return query
    },
    async rpc(name, args) { writes.push({ name, args }); return { data: { success: true }, error: rpcError } },
  }
  return { ctx: { userClaims: { sub: caller }, supabaseAdmin: db }, writes }
}

function mockNetwork(t) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/api/versions.json')) return Response.json(['16.19.1'])
    if (url.endsWith('/champion.json')) return Response.json({ data: Object.fromEntries(champions.map(c => [c.id, c])) })
    const id = url.split('/').at(-1)
    calls.push(id)
    return Response.json(matchData(id, { start: id === 'KR_101' ? 1000 : 2000 }))
  })
  return calls
}
const request = body => new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(body) })
const lookup = { match_id: 42, source: 'RIOT_API', action: 'lookup', game_ids: ['101', '102'] }

test('lookup is read-only; confirmation re-fetches Riot facts and saves through the atomic series RPC', async t => {
  const calls = mockNetwork(t)
  const handle = await handler()
  const { ctx, writes } = context()
  const response = await handle(request(lookup), ctx)
  assert.equal(response.status, 200)
  const { games } = await response.json()
  assert.equal(games.length, 2)
  assert.deepEqual(writes, [])
  assert.deepEqual(calls, ['KR_101', 'KR_102'])
  games.forEach(g => { g.reviewed = true; g.rows[0].kills = 999; g.winner = 'RED'; g.winnerManual = true })
  const saved = await handle(request({ match_id: 42, source: 'RIOT_API', games }), ctx)
  assert.equal(saved.status, 200)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].name, 'finish_riot_series')
  assert.equal(writes[0].args.p_winner, 'BLUE')
  assert.equal(writes[0].args.p_games[0].kda[0].kills, 4)
  assert.equal(writes[0].args.p_games[0].kda[0].champion_name, '아리')
  assert.equal(writes[0].args.p_games[0].riot_match_id, 'KR_101')
  assert.equal(writes[0].args.p_players.length, 10)
  assert.deepEqual(calls, ['KR_101', 'KR_102', 'KR_101', 'KR_102'])
})

test('unapproved members, outsiders, finished matches and previously recorded IDs are rejected before Riot requests', async t => {
  const calls = mockNetwork(t)
  const handle = await handler()
  for (const [options, expected] of [[{ approved: false }, 403], [{ caller: 'outsider' }, 403], [{ status: 'finished' }, 409], [{ duplicates: [{ riot_match_id: 'KR_101' }] }, 409]]) {
    const { ctx, writes } = context(options)
    assert.equal((await handle(request(lookup), ctx)).status, expected)
    assert.deepEqual(writes, [])
  }
  assert.deepEqual(calls, [])
})

test('missing review, duplicate IDs and reverse chronology do not save results', async t => {
  mockNetwork(t)
  const handle = await handler()
  const { ctx, writes } = context()
  assert.equal((await handle(request({ ...lookup, game_ids: ['101', 'KR_101'] }), ctx)).status, 400)
  assert.equal((await handle(request({ ...lookup, game_ids: ['102', '101'] }), ctx)).status, 400)
  const { games } = await (await handle(request(lookup), ctx)).json()
  assert.equal((await handle(request({ match_id: 42, source: 'RIOT_API', games }), ctx)).status, 400)
  assert.deepEqual(writes, [])
})

test('replay fallback still writes the same set statistics through finish_replay_series', async t => {
  const calls = mockNetwork(t)
  const handle = await handler()
  const { ctx, writes } = context()
  const { games } = await (await handle(request(lookup), ctx)).json()
  games.forEach(g => { delete g.source; delete g.riot_match_id; g.reviewed = true })
  const response = await handle(request({ match_id: 42, games }), ctx)
  assert.equal(response.status, 200)
  assert.equal(writes[0].name, 'finish_replay_series')
  assert.equal(writes[0].args.p_games.length, 2)
  assert.equal(writes[0].args.p_games[0].kda.length, 10)
  assert.deepEqual(calls, ['KR_101', 'KR_102'])
})

test('database uniqueness conflicts return a failure instead of reporting successful rating reflection', async t => {
  mockNetwork(t)
  const handle = await handler()
  const { ctx } = context({ rpcError: { code: '23505' } })
  const { games } = await (await handle(request(lookup), ctx)).json()
  games.forEach(g => { g.reviewed = true })
  const response = await handle(request({ match_id: 42, source: 'RIOT_API', games }), ctx)
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /이미 등록/)
})
