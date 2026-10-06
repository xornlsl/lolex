import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRiotMatchIds, fetchRiotMatch, riotMatchToGame, applyRiotReview } from '../supabase/functions/_shared/riot-match.js'
import { validateSeries, normalizeSeriesSides } from '../src/lib/replay.js'
import { members, participants, champions, matchData } from './fixtures/riot-match.mjs'

const context = { members, participants, champions }

test('game IDs accept numeric and KR forms, reject duplicates and unexpected hosts/regions', () => {
  assert.deepEqual(normalizeRiotMatchIds([' 101 ', 'kr_102']), ['KR_101', 'KR_102'])
  for (const input of [null, [], ['101'], ['101', 'KR_101'], ['101', 'NA1_102'], ['101', '../102'], ['101', ''], ['0', '102'], ['101', '102', '103', '104']]) {
    assert.throws(() => normalizeRiotMatchIds(input))
  }
})

test('Riot response maps aliases without case sensitivity and retains agreed positions instead of inferred roles', async () => {
  const data = matchData()
  data.info.participants[0].riotIdGameName = 'alias'
  data.info.participants[0].riotIdTagline = 'tag'
  data.info.participants[0].teamPosition = 'UTILITY'
  const game = await riotMatchToGame(data, 'KR_101', context)
  assert.equal(game.rows[0].user_id, 'user-0')
  assert.equal(game.rows[0].position, 'TOP')
  assert.equal(game.rows[0].champion, 'Ahri')
  assert.equal(game.winner, 'BLUE')
  assert.match(game.hash, /^[a-f0-9]{64}$/)
  assert.equal(game.hash, (await riotMatchToGame(data, 'KR_101', context)).hash)
})

test('review cannot tamper with Riot stats, winners, teams, or auto-identified members', async () => {
  const game = await riotMatchToGame(matchData(), 'KR_101', context)
  const review = structuredClone(game)
  review.reviewed = true
  review.winner = 'RED'
  review.winnerManual = true
  review.rows[0] = { ...review.rows[0], kills: 99, champion: 'Fake', team: 'RED', won: false }
  const restored = applyRiotReview(game, review, members, participants)
  assert.equal(restored.winner, 'BLUE')
  assert.equal(restored.rows[0].kills, 4)
  assert.equal(restored.rows[0].champion, 'Ahri')
  assert.equal(restored.rows[0].team, 'BLUE')
  assert.equal(restored.rows[0].won, true)
  review.rows[0].user_id = 'user-1'
  assert.throws(() => applyRiotReview(game, review, members, participants), /회원/)
  review.rows[0].user_id = 'user-0'
  review.rows[0].position = 'SUPPORT'
  assert.throws(() => applyRiotReview(game, review, members, participants), /포지션/)
  assert.throws(() => applyRiotReview(game, { ...game, reviewed: false }, members, participants), /검수/)
})

test('unresolved Riot ID allows explicit member mapping while duplicate membership is rejected by series validation', async () => {
  const raw = matchData()
  raw.info.participants[0].riotIdGameName = 'ChangedName'
  const game = await riotMatchToGame(raw, 'KR_101', context)
  assert.equal(game.rows[0].user_id, '')
  const review = structuredClone(game)
  review.reviewed = true
  review.rows[0].user_id = 'user-0'
  review.rows[0].position = 'TOP'
  const mapped = applyRiotReview(game, review, members, participants)
  assert.equal(validateSeries([mapped, mapped]), '')
  review.rows[0].user_id = 'user-1'
  review.rows[0].position = 'JUNGLE'
  const duplicate = applyRiotReview(game, review, members, participants)
  assert.match(validateSeries([duplicate, duplicate]), /중복/)
})

test('API BO3 keeps the existing series rules for side swaps, 2-1 wins and an invalid third game after 2-0', async () => {
  const games = await Promise.all([
    riotMatchToGame(matchData('KR_101'), 'KR_101', context),
    riotMatchToGame(matchData('KR_102', { swap: true, winner: 100 }), 'KR_102', context),
    riotMatchToGame(matchData('KR_103'), 'KR_103', context),
  ])
  assert.equal(validateSeries(games), '')
  assert.deepEqual(normalizeSeriesSides(games).map(g => g.winner), ['BLUE', 'RED', 'BLUE'])
  assert.match(validateSeries([games[0], games[0], games[2]]), /먼저 2승/)
})

test('incomplete, non-custom, bot and inconsistent results cannot be recorded', async () => {
  for (const change of [
    d => { d.metadata.matchId = 'KR_999' },
    d => { d.info.gameType = 'MATCHED_GAME' },
    d => { d.info.mapId = 12 },
    d => { d.info.participants.pop() },
    d => { d.info.participants[0].puuid = 'BOT' },
    d => { d.info.participants[0].kills = null },
    d => { d.info.participants[0].win = false },
    d => { d.info.participants[0].teamId = 300 },
    d => { d.info.participants[0].participantId = 2 },
  ]) {
    const raw = matchData(); change(raw)
    await assert.rejects(riotMatchToGame(raw, 'KR_101', context))
  }
})

test('Riot errors are actionable and do not expose server credentials', async () => {
  for (const [status, pattern] of [[403, /키가 만료/], [404, /찾지 못했/], [429, /요청이 많/], [500, /조회에 실패/]]) {
    await assert.rejects(fetchRiotMatch('KR_101', { apiKey: 'server-only-test-key', fetcher: async () => new Response('', { status }) }), pattern)
  }
  await assert.rejects(fetchRiotMatch('KR_101', { apiKey: '' }), /설정되지/)
  let requested
  await fetchRiotMatch('KR_101', { apiKey: 'server-only-test-key', fetcher: async (url, options) => {
    requested = { url, options }
    return Response.json(matchData())
  } })
  assert.equal(requested.url, 'https://asia.api.riotgames.com/lol/match/v5/matches/KR_101')
  assert.equal(requested.options.headers['X-Riot-Token'], 'server-only-test-key')
  assert.ok(requested.options.signal)
})
