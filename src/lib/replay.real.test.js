import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseReplay, normalizeSeriesSides, validateSeries } from './replay.js'

// Optional private fixtures: never copy player files into the repository.
test('reported real ROFL series remains W/L/L before and after team relabeling', {
  skip: !process.env.LOLEX_REPLAY_FIXTURE_DIR,
}, () => {
  const ids = ['8402595444','8402643525','8402721646']
  const games = ids.map(id => {
    const b=readFileSync(join(process.env.LOLEX_REPLAY_FIXTURE_DIR,`KR-${id}.rofl`))
    const g=parseReplay(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))
    return {...g,rows:g.rows.map((r,i)=>({...r,user_id:r.riotName,position:['TOP','JUNGLE','MID','ADC','SUPPORT'][i%5]}))}
  })
  assert.deepEqual(games.map(g=>g.winner), ['RED','RED','BLUE'])
  assert.equal(validateSeries(games),'')
  const normalized=normalizeSeriesSides(games)
  assert.deepEqual(normalized.map(g=>g.winner), ['RED','BLUE','BLUE'])
  // Reproduce the user editing team selectors to match the series roster,
  // with the stale physical-side winner still present in the saved UI state.
  const edited=games.map((g,i)=>({...g,rows:normalized[i].rows}))
  assert.equal(validateSeries(edited),'')
  assert.deepEqual(normalizeSeriesSides(edited).map(g=>g.winner), ['RED','BLUE','BLUE'])
})
