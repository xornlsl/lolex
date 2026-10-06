// ROFL v2 footer metadata layout documented by RoflLens:
// https://github.com/ss26367098/rofllens (container.py, metadata.py).
export function parseReplay(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const decode = data => new TextDecoder('utf-8', { fatal: true }).decode(data)
  if (bytes.length < 300 || decode(bytes.slice(0, 4)) !== 'RIOT') throw new Error('올바른 리플레이 파일이 아닙니다.')
  if (view.getUint16(4, true) !== 2) throw new Error('지원하지 않는 리플레이 버전입니다. 게임 ID 조회를 이용해주세요.')
  const headerEnd = 15 + bytes[14]
  const length = view.getUint32(bytes.length - 4, true)
  const start = bytes.length - 4 - length
  if (!bytes[14] || length > 4 * 1024 * 1024 || start - 256 < headerEnd) throw new Error('리플레이 파일이 손상되었거나 지원하지 않는 구조입니다.')
  let metadata, stats
  try {
    metadata = JSON.parse(decode(bytes.slice(start, bytes.length - 4)))
    stats = JSON.parse(metadata.statsJson || '[]')
  } catch { throw new Error('리플레이 통계를 읽지 못했습니다. 게임 ID 조회를 이용해주세요.') }
  if (!Array.isArray(stats) || stats.length !== 10) throw new Error('이 파일에는 10명의 종료 통계가 없습니다. 게임 ID 조회를 이용해주세요.')
  const number = value => value !== '' && value != null && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 999 ? Number(value) : ''
  const rows = stats.map(p => ({
    riotName: p.RIOT_ID_GAME_NAME ? `${p.RIOT_ID_GAME_NAME}${p.RIOT_ID_TAG_LINE ? '#' + p.RIOT_ID_TAG_LINE : ''}` : (p.NAME || ''),
    team: String(p.TEAM) === '100' ? 'BLUE' : String(p.TEAM) === '200' ? 'RED' : '',
    champion: p.SKIN || '',
    kills: number(p.CHAMPIONS_KILLED), deaths: number(p.NUM_DEATHS), assists: number(p.ASSISTS),
    won: p.WIN === 'Win' ? true : p.WIN === 'Fail' || p.WIN === 'Lose' ? false : null,
  }))
  const winners = [...new Set(rows.filter(r => r.won === true).map(r => r.team))]
  const winner = winners.length === 1 && rows.every(r => r.team && r.won === (r.team === winners[0])) ? winners[0] : ''
  return { patch: decode(bytes.slice(15, headerEnd)), rows, winner }
}

// Keep a team's series identity when the entire lobby swaps map sides.
// Require all returning members to agree; never guess from a majority.
export function replayGameWinner(game) {
  if (game.winnerManual === true) return game.winner
  // WIN belongs to a player. It remains correct even when the reviewer
  // relabels BLUE/RED to match the lobby's series teams.
  if (game.rows.length === 10 && game.rows.every(r => typeof r.won === 'boolean')) {
    const winningRows = game.rows.filter(r => r.won)
    const winners = new Set(winningRows.map(r => r.team))
    if (winningRows.length !== 5 || winners.size !== 1) return ''
    const [team] = winners
    return ['BLUE','RED'].includes(team) && game.rows.every(r => r.won === (r.team === team)) ? team : ''
  }
  return game.winner
}

export function normalizeSeriesSides(games) {
  const teams = new Map()
  return games.map((game, index) => {
    const gameWinner = replayGameWinner(game)
    const votes = game.rows.filter(r => teams.has(r.user_id) && ['BLUE','RED'].includes(r.team))
      .map(r => ({ row: r, flipped: teams.get(r.user_id) !== r.team }))
    if (index > 0 && !votes.length) throw new Error(`${index + 1}세트에 이전 세트와 연결할 회원이 없습니다. 회원 선택을 확인해주세요.`)
    if (new Set(votes.map(v => v.flipped)).size > 1) {
      throw new Error(`${index + 1}세트의 팀 구성이 이전 세트와 다릅니다. ${votes.map(v => `${v.row.riotName}: ${teams.get(v.row.user_id)} → ${v.row.team}`).join(', ')}. 팀 전체의 진영 교대는 허용됩니다. 회원과 팀 선택을 확인해주세요.`)
    }
    const flipped = votes[0]?.flipped === true
    const flip = team => flipped && ['BLUE','RED'].includes(team) ? (team === 'BLUE' ? 'RED' : 'BLUE') : team
    const rows = game.rows.map(r => {
      const team = flip(r.team)
      if (r.user_id && ['BLUE','RED'].includes(team)) teams.set(r.user_id, team)
      return { ...r, original_team: r.original_team ?? r.team, team }
    })
    return { ...game, original_winner: game.original_winner ?? game.winner, winner: flip(gameWinner), rows }
  })
}

export function validateSeries(games) {
  if (![2, 3].includes(games.length)) return '2개 또는 3개의 세트를 등록해주세요.'
  try { games = normalizeSeriesSides(games) } catch (error) { return error.message }
  const wins = { BLUE: 0, RED: 0 }
  const slots = new Map()
  for (const [index, game] of games.entries()) {
    if (wins.BLUE === 2 || wins.RED === 2) return `입력된 순서에서 ${wins.BLUE === 2 ? '1세트 블루팀' : '1세트 레드팀'} 구성원이 먼저 2승을 달성했습니다. 세트 순서와 직접 수정한 승리 팀을 확인해주세요. 다른 경기인지 여부는 이 정보만으로 판단하지 않습니다.`
    if (!['BLUE', 'RED'].includes(game.winner)) return `${index + 1}세트 승리 팀을 확인해주세요.`
    if (game.rows.length !== 10 || new Set(game.rows.map(r => r.user_id)).size !== 10) return `${index + 1}세트 회원 10명을 중복 없이 선택해주세요.`
    const positions = new Set()
    for (const r of game.rows) {
      if (!r.user_id || !r.riotName || !r.champion || !['BLUE','RED'].includes(r.team) || !['TOP','JUNGLE','MID','ADC','SUPPORT'].includes(r.position)) return `${index + 1}세트 회원·팀·포지션·챔피언을 확인해주세요.`
      if (![r.kills,r.deaths,r.assists].every(v => Number.isInteger(v) && v >= 0 && v <= 999)) return `${index + 1}세트 K/D/A를 확인해주세요.`
      const slot = `${r.team}/${r.position}`
      if (positions.has(slot)) return `${index + 1}세트 팀별 포지션이 중복되었습니다.`
      positions.add(slot)
      if (slots.has(r.user_id) && slots.get(r.user_id) !== slot) return `${index + 1}세트 '${r.riotName}'의 포지션이 이전 세트와 다릅니다 (${slots.get(r.user_id).split('/')[1]} → ${r.position}). 해당 세트의 포지션을 확인해주세요.`
      slots.set(r.user_id, slot)
    }
    wins[game.winner]++
  }
  return Math.max(wins.BLUE, wins.RED) === 2 ? '' : '한 팀이 2승을 달성해야 합니다.'
}
