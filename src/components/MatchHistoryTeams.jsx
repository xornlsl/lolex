import { useState } from 'react'

const positions = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']

function ChampionPortrait({ player }) {
  const [failed, setFailed] = useState(false)
  const key = player.champion_key
  const version = player.icon_version
  return key && version && !failed
    ? <img className="history-portrait" src={`https://ddragon.leagueoflegends.com/cdn/${encodeURIComponent(version)}/img/champion/${encodeURIComponent(key)}.png`} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <span className="history-portrait history-portrait-empty" aria-hidden="true">{(player.champion_name || player.champion || '?').slice(0, 1)}</span>
}

export default function MatchHistoryTeams({ players = [], winner }) {
  return <div className="history-team-grid">
    {['BLUE', 'RED'].map(team => <section className={`history-team history-team-${team.toLowerCase()}`} key={team}>
      <header className="history-team-heading"><h4>{team === 'BLUE' ? '블루팀' : '레드팀'}</h4><span>{winner === team ? '승리' : '패배'}</span></header>
      <div className="history-team-columns" aria-hidden="true"><span>포지션 · 플레이어 / 챔피언</span><span>K / D / A</span></div>
      <ul className="history-player-list">
        {players.filter(p => p.team === team).sort((a, b) => positions.indexOf(a.position) - positions.indexOf(b.position)).map(player => <li className="history-player" key={player.user_id || player.id}>
          <span className="history-position">{player.position === 'SUPPORT' ? 'SUP' : player.position || '—'}</span>
          <ChampionPortrait key={`${player.champion_key}-${player.icon_version}`} player={player} />
          <div className="history-player-name"><strong>{player.played_riot_id || player.lol_nickname || player.username}</strong><small>{player.champion_name || player.champion || '챔피언 정보 없음'}</small></div>
          <strong className="history-kda" aria-label={`킬 ${player.kills ?? '미기록'}, 데스 ${player.deaths ?? '미기록'}, 어시스트 ${player.assists ?? '미기록'}`}>{player.kills ?? '—'} / {player.deaths ?? '—'} / {player.assists ?? '—'}</strong>
        </li>)}
      </ul>
    </section>)}
  </div>
}
