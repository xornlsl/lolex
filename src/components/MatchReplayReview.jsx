import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../lib/api'
import { parseReplay, validateSeries, normalizeSeriesSides, replayGameWinner } from '../lib/replay'
import { editReplayGame, completeReplayReview, allReplayGamesReviewed } from '../lib/replayReviewState'

const positions = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']
const key = s => s.normalize('NFKC').trim().toLowerCase()

export default function MatchReplayReview({ matchId, players = [], onSaved }) {
  const [members, setMembers] = useState([])
  const [champions, setChampions] = useState([])
  const [games, setGames] = useState([])
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)
  const [retry, setRetry] = useState(0)
  const generation = useRef({ value: 0 })
  useEffect(() => {
    let active = true
    const counter = generation.current
    apiRequest('lolex-replay-result').then(data => {
      if (active) { setMembers(data.members); setChampions(data.champions); setReady(true); setError('') }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false; counter.value++ }
  }, [retry])
  const identify = name => {
    const found = members.filter(m => [m.lol_nickname, ...m.aliases].some(n => key(name).includes('#') ? key(n) === key(name) : key(n).split('#')[0] === key(name)))
    return found.length === 1 ? found[0].user_id : ''
  }
  const load = async event => {
    const files = [...event.target.files]
    event.target.value = ''
    if (![2,3].includes(files.length)) { setError('경기 순서대로 리플레이 2개 또는 3개를 선택해주세요.'); return }
    const run = ++generation.current.value
    setBusy(true); setError(''); setGames([]); setStep(0)
    try {
      const next = []
      for (const [index, file] of files.entries()) {
        if (!/\.rofl$/i.test(file.name) || file.size > 150 * 1024 * 1024) throw new Error('150MB 이하의 .rofl 파일만 등록할 수 있습니다.')
        setStatus(`${index + 1}/${files.length} 파일 분석 중…`)
        const buffer = await file.arrayBuffer()
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('')
        if (next.some(g => g.hash === hash)) throw new Error('같은 리플레이가 중복 선택되었습니다.')
        const parsed = parseReplay(buffer)
        const rows = parsed.rows.map(row => {
          const user_id = identify(row.riotName)
          const player = players.find(p => p.user_id === user_id)
          const champion = champions.find(c => c.id === row.champion || c.name === row.champion || String(c.key) === String(row.champion))?.id || ''
          return { ...row, user_id, champion, position: player?.position || '' }
        })
        next.push({ ...parsed, rows, hash, filename: file.name, reviewed: false })
      }
      if (generation.current.value === run) { setGames(next); setStatus('분석 완료. 각 세트의 모든 항목을 확인해주세요.') }
    } catch (e) { if (generation.current.value === run) { setError(e.message); setStatus('분석이 완료되지 않았습니다. 저장된 결과는 없습니다.') } }
    finally { if (generation.current.value === run) setBusy(false) }
  }
  const editGame = patch => setGames(old => editReplayGame(old, step, patch))
  const editRow = (index, patch) => editGame({ rows: games[step].rows.map((r,i) => i === index ? { ...r, ...patch } : r) })
  const review = () => {
    const g = games[step]
    // Validate a single set by pairing it with an identical winning set.
    const invalid = validateSeries([g,g])
    if (invalid) { setError(invalid.replace(/1세트|2세트/g, `${step + 1}세트`)); return }
    setError('')
    setGames(old => completeReplayReview(old, step))
    setStep(step + 1)
  }
  const save = async () => {
    const invalid = validateSeries(games)
    if (invalid) { setError(invalid); return }
    if (!allReplayGamesReviewed(games) || busy) return
    if (!window.confirm('검수한 결과를 확정할까요? 시리즈 승패와 레이팅이 한 번 반영됩니다.')) return
    setBusy(true); setError('')
    try {
      await apiRequest('lolex-replay-result', { method: 'POST', body: { match_id: matchId, games } })
      setStatus('경기 결과가 저장되었습니다.')
      await onSaved()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  const game = games[step]
  let normalizedGames = []
  let teamError = ''
  try { normalizedGames = normalizeSeriesSides(games) } catch (e) { teamError = e.message }
  const blue = normalizedGames.filter(g => g.winner === 'BLUE').length
  const red = normalizedGames.filter(g => g.winner === 'RED').length
  return <section className="replay-panel" aria-label="리플레이 결과 등록" aria-busy={busy}>
    <div className="replay-heading"><span>LOLEX · MATCH RECORD</span><h3>리플레이로 경기 기록하기</h3><p>2~3개 파일을 경기 순서대로 선택하고, 세트별 기록을 확인해주세요.</p></div>
    <ol className="replay-progress">{['파일 등록','자동 분석','세트 검수','확정 저장'].map((label,i) => <li key={label} aria-current={(busy && !games.length ? 1 : !games.length ? 0 : step < games.length ? 2 : 3) === i ? 'step' : undefined}>{i + 1}. {label}</li>)}</ol>
    <label className="replay-upload">리플레이 2~3개 선택<input type="file" accept=".rofl" multiple disabled={busy || !ready} onChange={load} /></label>
    <p className="replay-hint">파일은 이 브라우저에서 분석합니다. 검수 후 확정한 경기 정보가 서버에 저장됩니다.</p>
    {!ready && <button type="button" disabled={busy} onClick={() => setRetry(n => n + 1)}>회원·챔피언 목록 다시 불러오기</button>}
    {status && <p role="status">{status}</p>}
    {games.length > 0 && <ol className="replay-order">{games.map((g,i) => <li key={g.hash}>{i + 1}세트: {g.filename} {i > 0 && <button type="button" disabled={busy} onClick={() => {
      const reordered = games.map(x => ({...x,reviewed:false})); [reordered[i-1],reordered[i]] = [reordered[i],reordered[i-1]];
      setGames(reordered); setStep(0); setError('');
    }}>앞 세트로 이동</button>}</li>)}</ol>}
    {error && <p className="login-error" role="alert">{error}</p>}
    {games.length > 0 && <nav className="replay-tabs" aria-label="세트 검수">{games.map((g,i) => <button type="button" key={g.hash} disabled={busy || (i > 0 && !games.slice(0,i).every(x => x.reviewed))} onClick={() => setStep(i)} aria-pressed={step === i}>{i + 1}세트 {g.reviewed ? '✓' : '확인 필요'}</button>)}</nav>}
    {game && <fieldset disabled={busy} className="replay-review"><legend>{step + 1}세트 검수</legend>
      <p className="replay-file">{game.filename} · 패치 {game.patch}</p>
      <label>이 세트의 승리 팀 ({game.winnerManual ? '직접 선택' : '선수별 승패 기준 자동 계산'})<select value={replayGameWinner(game)} onChange={e => editGame({ winner: e.target.value, winnerManual: true })}><option value="">선택해주세요</option><option value="BLUE">블루팀</option><option value="RED">레드팀</option></select></label>
      {game.winnerManual && <button type="button" onClick={() => editGame({winnerManual:false})}>리플레이 승패로 되돌리기</button>}
      <p>자동 입력된 값도 모두 확인해주세요. 회원이 구분되지 않으면 해시태그를 보고 선택하세요. 포지션은 플레이한 실제 포지션입니다.</p>
      <div className="replay-rows">{game.rows.map((row,i) => <article className="replay-row" key={i}>
        <strong>{i + 1}. {row.riotName || '닉네임 확인 필요'} · 원본 {row.won === true ? '승리' : row.won === false ? '패배' : '승패 미확인'}</strong>
        <label>플레이한 닉네임<input maxLength={100} value={row.riotName} onChange={e => editRow(i,{riotName:e.target.value})} /></label>
        <label>회원<select value={row.user_id} onChange={e => editRow(i, { user_id: e.target.value })}><option value="">회원 선택</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.lol_nickname}</option>)}</select></label>
        <label>팀<select value={row.team} onChange={e => editRow(i,{team:e.target.value})}><option value="">선택</option><option value="BLUE">블루</option><option value="RED">레드</option></select></label>
        <label>포지션<select value={row.position} onChange={e => editRow(i,{position:e.target.value})}><option value="">선택</option>{positions.map(p => <option key={p}>{p}</option>)}</select></label>
        <label>챔피언<select value={row.champion} onChange={e => editRow(i,{champion:e.target.value})}><option value="">챔피언 선택</option>{champions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="replay-kda">{[['kills','킬'],['deaths','데스'],['assists','어시스트']].map(([k,label]) => <label key={k}>{label}<input type="number" min="0" max="999" step="1" value={row[k]} onChange={e => editRow(i,{[k]:e.target.value === '' ? '' : Number(e.target.value)})} /></label>)}</div>
      </article>)}</div>
      <button type="button" className="match-capture-confirm" onClick={review}>이 세트 검수 완료 → {step + 1 < games.length ? '다음 세트' : '최종 확인'}</button>
    </fieldset>}
    {games.length > 0 && !game && <div className="replay-summary"><h3>최종 확인</h3>{teamError ? <p role="alert" className="login-error">{teamError}</p> : <p>1세트 블루팀 구성원 {blue}승 · 1세트 레드팀 구성원 {red}승</p>}<p>세트마다 진영이 바뀌어도 같은 구성원을 기준으로 합산합니다. 시리즈 승패·레이팅은 한 번, 챔피언 전적은 출전한 세트마다 반영됩니다.</p>
      {!teamError && <ul>{normalizedGames.map((g,i) => <li key={g.hash}>{i + 1}세트: 1세트 {g.winner === 'BLUE' ? '블루팀' : g.winner === 'RED' ? '레드팀' : '승리 팀 확인 필요'} 구성원 승리 · {g.filename}</li>)}</ul>}
      {!allReplayGamesReviewed(games) && <p role="status">아직 검수 완료되지 않은 세트가 있습니다. 위의 세트 버튼에서 검수를 완료해주세요.</p>}
      <button className="match-capture-confirm" type="button" disabled={busy || !allReplayGamesReviewed(games)} onClick={save}>{busy ? '저장 중…' : '경기 결과 확정'}</button></div>}
  </section>
}
