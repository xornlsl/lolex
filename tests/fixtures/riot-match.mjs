export const positions = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']
export const members = Array.from({ length: 10 }, (_, i) => ({ user_id: `user-${i}`, lol_nickname: `Player${i}#KR1`, aliases: i === 0 ? ['Alias#TAG'] : [] }))
export const participants = members.map((m, i) => ({ user_id: m.user_id, team: i < 5 ? 'BLUE' : 'RED', position: positions[i % 5] }))
export const champions = [{ id: 'Ahri', key: '103', name: '아리', version: '16.19.1' }]
export function matchData(id = 'KR_101', { winner = 100, swap = false, start = 1000 } = {}) {
  return {
    metadata: { matchId: id },
    info: { gameType: 'CUSTOM_GAME', mapId: 11, gameVersion: '16.19.1', gameStartTimestamp: start,
      participants: members.map((_, i) => {
        const teamId = (i < 5) !== swap ? 100 : 200
        return { participantId: i + 1, puuid: `puuid-${i}`, riotIdGameName: `player${i}`, riotIdTagline: 'kr1',
          championId: 103, teamId, win: teamId === winner, kills: 4, deaths: 2, assists: 6 }
      }),
    },
  }
}
