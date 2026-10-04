export default function MostChampions({ champions = [] }) {
  return <section className="most-champions" aria-label="모스트 챔피언">
    <h3>모스트 챔피언 TOP 3</h3>
    <p className="champion-source">본계정·부계정의 확정된 모임 경기 합산</p>
    {champions.length === 0 ? <p>아직 집계된 챔피언 기록이 없습니다.</p> : champions.slice(0, 3).map(champion => <article key={champion.champion_key} className="champion-stat-row">
      <div className="champion-identity"><img src={champion.icon_url} alt={champion.champion_name} loading="lazy" /><strong>{champion.champion_name}</strong></div>
      <div><strong>KDA {champion.kda === null ? 'Perfect' : `${Number(champion.kda).toFixed(2)}:1`}</strong><small>{Number(champion.avg_kills).toFixed(1)}/{Number(champion.avg_deaths).toFixed(1)}/{Number(champion.avg_assists).toFixed(1)}</small></div>
      <div><strong>{champion.win_rate}%</strong><small>{champion.games}게임 {champion.wins}승 {champion.losses}패</small></div>
    </article>)}
  </section>
}
