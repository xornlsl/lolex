import test from 'node:test'
import assert from 'node:assert/strict'
import { parseReplay, validateSeries, normalizeSeriesSides, replayGameWinner } from './replay.js'

function fixture(stats) {
  const json = new TextEncoder().encode(JSON.stringify({ statsJson: JSON.stringify(stats) }))
  const data = new Uint8Array(320 + json.length + 4)
  data.set(new TextEncoder().encode('RIOT'))
  const view = new DataView(data.buffer)
  view.setUint16(4,2,true); data[14] = 4; data.set(new TextEncoder().encode('test'),15)
  data.set(json,320); view.setUint32(data.length-4,json.length,true)
  return data.buffer
}
const raw = Array.from({length:10},(_,i) => ({ NAME:`Player${i}`,TEAM:i<5?'100':'200',WIN:i<5?'Win':'Fail',SKIN:'Ahri',CHAMPIONS_KILLED:'0',NUM_DEATHS:'2',ASSISTS:'3' }))
test('ROFL v2 footer preserves zero KDA and actual winning team', () => {
  const result = parseReplay(fixture(raw)); assert.equal(result.winner,'BLUE'); assert.equal(result.rows.length,10); assert.equal(result.rows[0].kills,0)
})
test('missing numbers are not fabricated as zero', () => {
  assert.equal(parseReplay(fixture(raw.map(p=>({...p,ASSISTS:undefined})))).rows[0].assists,'')
})
test('missing statistics and invalid metadata boundaries are rejected', () => {
  assert.throws(()=>parseReplay(fixture([])))
  const buffer=fixture(raw); new DataView(buffer).setUint32(buffer.byteLength-4,0xffffffff,true)
  assert.throws(()=>parseReplay(buffer))
})
const rows=raw.map((_,i)=>({user_id:String(i),riotName:`p${i}`,champion:'Ahri',team:i<5?'BLUE':'RED',position:['TOP','JUNGLE','MID','ADC','SUPPORT'][i%5],kills:0,deaths:0,assists:0}))
test('BO3 accepts 1-2, rejects third set after 2-0 and duplicate members',()=>{
  assert.equal(validateSeries(['BLUE','RED','RED'].map(winner=>({winner,rows}))), '')
  assert.notEqual(validateSeries(['BLUE','BLUE','RED'].map(winner=>({winner,rows}))), '')
  assert.notEqual(validateSeries(['BLUE','BLUE'].map(winner=>({winner,rows:[rows[0],...rows.slice(0,9)]}))), '')
})
test('substitution retains team and position and can appear in one set',()=>{
  const games=['BLUE','RED','RED'].map(winner=>({winner,rows:rows.map(r=>({...r}))}))
  games[0].rows[3].user_id='substitute'
  assert.equal(validateSeries(games),'')
  games[2].rows[0].position='MID'
  assert.notEqual(validateSeries(games),'')
})
test('side swaps count wins by roster, including an ADC substitute', () => {
  const games = ['BLUE','BLUE','BLUE'].map((winner,i) => ({ winner, rows: rows.map(r => ({ ...r,
    team: i === 0 ? r.team : r.team === 'BLUE' ? 'RED' : 'BLUE',
    user_id: i === 0 && r.user_id === '3' ? 'first-set-adc' : r.user_id,
  })) }))
  assert.equal(validateSeries(games), '')
  const result = normalizeSeriesSides(games)
  assert.deepEqual(result.map(g => g.winner), ['BLUE','RED','RED'])
  assert.equal(result[1].rows[3].team, 'BLUE')
  assert.equal(result[1].original_winner, 'BLUE')
  assert.equal(result[1].rows[3].original_team, 'RED')
  assert.equal(games[1].rows[3].team, 'RED')
  assert.deepEqual(normalizeSeriesSides(result), result)
})
test('isolated team reassignment is rejected rather than guessed', () => {
  const games = ['BLUE','BLUE'].map(winner => ({winner, rows:rows.map(r=>({...r}))}))
  games[1].rows[0].team = 'RED'
  assert.match(validateSeries(games), /2세트.*p0/)
})
test('position mismatch identifies the player and both positions', () => {
  const games = ['BLUE','BLUE'].map(winner => ({winner, rows:rows.map(r=>({...r}))}))
  games[1].rows[0].position = 'MID'
  assert.match(validateSeries(games), /2세트 'p0'.*TOP → MID/)
})
test('reviewed team labels cannot leave the automatic winner on the old side', () => {
  // User roster: RED/BLUE/RED physically; Win/Loss/Loss. Reviewer labels
  // the same roster RED in all sets but the previous UI kept RED/RED/BLUE.
  const games = ['RED','RED','BLUE'].map((winner,i) => ({ winner, rows: rows.map(r => ({
    ...r, won: i === 0 ? r.team === 'RED' : r.team === 'BLUE',
  })) }))
  assert.equal(replayGameWinner(games[1]), 'BLUE')
  assert.equal(validateSeries(games), '')
  assert.deepEqual(normalizeSeriesSides(games).map(g=>g.winner), ['RED','BLUE','BLUE'])
  assert.deepEqual(normalizeSeriesSides(normalizeSeriesSides(games)), normalizeSeriesSides(games))
})
test('an explicitly reviewed winner overrides automatic results', () => {
  const game = { winner:'RED',winnerManual:true,rows:rows.map(r=>({...r,won:r.team==='BLUE'})) }
  assert.equal(replayGameWinner(game),'RED')
})
test('conflicting player outcomes require review instead of guessing a winner', () => {
  const game = { winner:'BLUE',rows:rows.map(r=>({...r,won:true})) }
  assert.equal(replayGameWinner(game),'')
  assert.notEqual(validateSeries([game,game]),'')
})
