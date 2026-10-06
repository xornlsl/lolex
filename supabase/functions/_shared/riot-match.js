export class RiotMatchError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}

export function normalizeRiotMatchIds(values) {
  if (!Array.isArray(values) || ![2, 3].includes(values.length)) throw new RiotMatchError('경기 순서대로 게임 ID 2개 또는 3개를 입력해주세요.')
  const ids = values.map(value => {
    const id = typeof value === 'string' ? value.trim().toUpperCase() : ''
    if (!/^(KR_)?[1-9][0-9]{0,19}$/.test(id)) throw new RiotMatchError('한국 서버 게임 ID를 입력해주세요. 예: 8408967253 또는 KR_8408967253')
    return id.startsWith('KR_') ? id : `KR_${id}`
  })
  if (new Set(ids).size !== ids.length) throw new RiotMatchError('같은 게임 ID를 중복 입력할 수 없습니다.')
  return ids
}

const nameKey = value => value.normalize('NFKC').trim().toLowerCase()
const teamName = id => id === 100 ? 'BLUE' : id === 200 ? 'RED' : ''

export async function fetchRiotMatch(id, { apiKey, region = 'asia', fetcher = fetch }) {
  if (!apiKey) throw new RiotMatchError('게임 ID 조회가 아직 설정되지 않았습니다. 관리자에게 문의하거나 리플레이 업로드를 이용해주세요.', 503)
  if (region !== 'asia') throw new RiotMatchError('한국 서버 조회 지역 설정을 확인해주세요.', 503)
  let response
  try {
    response = await fetcher(`https://${region}.api.riotgames.com/lol/match/v5/matches/${id}`, {
      headers: { 'X-Riot-Token': apiKey }, signal: AbortSignal.timeout(15000),
    })
  } catch { throw new RiotMatchError('Riot 서버에 연결하지 못했습니다. 잠시 후 다시 조회해주세요.', 502) }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new RiotMatchError('Riot API 키가 만료되었거나 조회 권한이 없습니다. 관리자에게 문의해주세요.', 503)
    if (response.status === 404) throw new RiotMatchError(`${id} 경기를 찾지 못했습니다. ID를 확인하고, 방금 끝난 경기라면 잠시 후 다시 조회해주세요.`, 404)
    if (response.status === 429) throw new RiotMatchError('Riot 조회 요청이 많습니다. 잠시 후 다시 시도해주세요.', 429)
    throw new RiotMatchError('Riot 경기 조회에 실패했습니다. 잠시 후 다시 시도해주세요.', 502)
  }
  try { return await response.json() }
  catch { throw new RiotMatchError('Riot 경기 응답을 읽지 못했습니다. 다시 조회해주세요.', 502) }
}

export async function riotMatchToGame(data, id, { members, participants, champions }) {
  const info = data?.info
  if (data?.metadata?.matchId !== id || !info) throw new RiotMatchError('요청한 게임 ID와 조회 결과가 다릅니다.')
  if (info.gameType !== 'CUSTOM_GAME' || info.mapId !== 11) throw new RiotMatchError(`${id}: 소환사의 협곡 사용자 설정 경기만 등록할 수 있습니다.`)
  if (!Array.isArray(info.participants) || info.participants.length !== 10) throw new RiotMatchError(`${id}: 참가자 10명의 경기만 등록할 수 있습니다.`)
  const rows = info.participants.map(p => {
    const team = teamName(p.teamId)
    if (!team || !Number.isInteger(p.participantId) || ![p.kills, p.deaths, p.assists].every(n => Number.isInteger(n) && n >= 0 && n <= 999) || typeof p.win !== 'boolean') {
      throw new RiotMatchError(`${id}: 참가자 통계 또는 승패가 완전하지 않습니다.`)
    }
    if (typeof p.riotIdGameName !== 'string' || !p.riotIdGameName.trim() || typeof p.riotIdTagline !== 'string' || !p.riotIdTagline.trim() || p.puuid === 'BOT') {
      throw new RiotMatchError(`${id}: Riot ID가 없는 참가자 또는 봇이 포함되어 있습니다.`)
    }
    const riotName = `${p.riotIdGameName}#${p.riotIdTagline}`
    const matches = members.filter(m => [m.lol_nickname, ...(m.aliases || [])].some(n => nameKey(n) === nameKey(riotName)))
    const userId = matches.length === 1 ? matches[0].user_id : ''
    const player = participants.find(p => p.user_id === userId)
    const champion = champions.find(c => String(c.key) === String(p.championId))
    if (!champion) throw new RiotMatchError(`${id}: 챔피언 정보를 찾지 못했습니다. 잠시 후 다시 조회해주세요.`)
    return { participantId: p.participantId, riotName, user_id: userId, identified_user_id: userId,
      team, position: player?.position || '', champion: champion.id,
      kills: p.kills, deaths: p.deaths, assists: p.assists, won: p.win }
  })
  const winningTeam = rows.find(r => r.won)?.team
  if (new Set(rows.map(r => r.participantId)).size !== 10 || new Set(rows.map(r => nameKey(r.riotName))).size !== 10 ||
      rows.filter(r => r.team === 'BLUE').length !== 5 || rows.filter(r => r.won).length !== 5 ||
      !winningTeam || rows.some(r => r.won !== (r.team === winningTeam))) throw new RiotMatchError(`${id}: 팀 구성 또는 승패 정보가 올바르지 않습니다.`)
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`riot-match:${id}`)))].map(n => n.toString(16).padStart(2, '0')).join('')
  return { source: 'RIOT_API', riot_match_id: id, hash, filename: id, patch: String(info.gameVersion || ''),
    started_at: info.gameStartTimestamp || info.gameCreation || null, rows, winner: winningTeam, reviewed: false }
}

// Only member/position review is accepted from the browser. All game facts come
// from the fresh Riot response, including the winner, champion and K/D/A.
export function applyRiotReview(game, review, members, participants) {
  if (!review || review.reviewed !== true || review.riot_match_id !== game.riot_match_id || !Array.isArray(review.rows) || review.rows.length !== 10 ||
      new Set(review.rows.map(r => r?.participantId)).size !== 10) throw new RiotMatchError('모든 세트의 검수를 완료해주세요.')
  return { ...game, reviewed: true, rows: game.rows.map(row => {
    const choice = review.rows.find(r => r?.participantId === row.participantId)
    if (!choice || !members.some(m => m.user_id === choice.user_id) || (row.user_id && choice.user_id !== row.user_id)) throw new RiotMatchError('조회된 Riot ID에 연결된 회원을 확인해주세요.')
    const original = participants.find(p => p.user_id === choice.user_id)
    if (original && choice.position !== original.position) throw new RiotMatchError('매칭 때 확정한 포지션과 다릅니다.')
    return { ...row, user_id: choice.user_id, position: original?.position || choice.position }
  }) }
}
