import { useEffect, useRef, useState } from 'react'
import { readScoreboard } from '../lib/readScoreboard'

import { readOutcome } from '../lib/readOutcome'

function gameWinner(game) {
  if (!game.uploaderTeam) return ''
  if (game.outcome === 'victory') return game.uploaderTeam
  return game.uploaderTeam === 'BLUE' ? 'RED' : 'BLUE'
}

function parseKdaInput(value) {
  const match = value.trim().match(/^(\d{1,3})\s*\/\s*(\d{1,3})\s*\/\s*(\d{1,3})$/)
  if (!match) return null
  const values = match.slice(1).map(Number)
  return values.every(value => value >= 0 && value <= 999)
    ? { kills: values[0], deaths: values[1], assists: values[2] }
    : null
}

export default function MatchScreenshotPreview({ onConfirm, busy = false }) {
  const [games, setGames] = useState([])
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const [diagnostics, setDiagnostics] = useState([])
  const [reviewGameNumber, setReviewGameNumber] = useState(1)
  const previewUrls = useRef([])
  const victories = games.filter((game) => game.outcome === 'victory').length
  const defeats = games.filter((game) => game.outcome === 'defeat').length
  const validName = value => value.trim().length > 0
  const gameIsValid = game => game.uploaderTeam &&
    game.rows.every(row => validName(row.riotNameInput) && parseKdaInput(row.kdaInput)) &&
    new Set(game.rows.map(row => row.riotNameInput.replace(/\s/g, '').toLowerCase())).size === 10
  const allGamesReviewed = games.length >= 2 && games.every(game => game.reviewed && gameIsValid(game))
  const currentGame = games.find(game => game.gameNumber === reviewGameNumber)
  const allTeamsSelected = games.length >= 2 && games.every(game => game.uploaderTeam)
  const blueWins = allTeamsSelected ? games.filter((game) => gameWinner(game) === 'BLUE').length : 0
  const redWins = allTeamsSelected ? games.filter((game) => gameWinner(game) === 'RED').length : 0
  const winner = blueWins >= 2 ? 'BLUE' : redWins >= 2 ? 'RED' : ''
  const seriesOutcome = victories >= 2 ? 'victory' : defeats >= 2 ? 'defeat' : ''

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const selectTeam = (gameNumber, uploaderTeam) => {
    setGames((current) => current.map((game) =>
      game.gameNumber === gameNumber ? { ...game, uploaderTeam, reviewed: false } : game
    ))
  }

  const updateKda = (gameNumber, rowIndex, value) => {
    setGames(current => current.map(game => game.gameNumber !== gameNumber ? game : {
      ...game,
      reviewed: false,
      rows: game.rows.map((row, index) => index !== rowIndex ? row : {
        ...row,
        recognized: false,
        kdaInput: value,
        ...parseKdaInput(value),
      }),
    }))
  }

  const updateName = (gameNumber, rowIndex, value) => {
    setGames(current => current.map(game => game.gameNumber !== gameNumber ? game : {
      ...game,
      reviewed: false,
      rows: game.rows.map((row, index) => index !== rowIndex ? row : {
        ...row, recognizedName: false, riotNameInput: value, riotName: value,
      }),
    }))
  }

  const reviewGame = (gameNumber) => {
    const game = games.find(item => item.gameNumber === gameNumber)
    if (!game || !gameIsValid(game)) return
    setGames(current => current.map(item =>
      item.gameNumber === gameNumber ? { ...item, reviewed: true } : item))
    const next = games.find(item => item.gameNumber === gameNumber + 1)
    if (next) setReviewGameNumber(next.gameNumber)
  }

  const editGame = (gameNumber) => {
    setGames(current => current.map(game =>
      game.gameNumber === gameNumber ? { ...game, reviewed: false } : game))
    setReviewGameNumber(gameNumber)
  }

  const onFileChange = async (event) => {
    const files = [...(event.target.files || [])]
    if (!files.length) return
    setDiagnostics([])
    setReviewGameNumber(1)
    if (files.length < 2 || files.length > 3 || files.some((file) =>
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024
    )) {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
      previewUrls.current = []
      setGames([])
      setMessage('캡처 2장 또는 3장을 한 번에 선택해주세요. 파일당 15MB 이하의 PNG, JPG, WEBP만 가능합니다.')
      event.target.value = ''
      return
    }
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current = files.map(file => URL.createObjectURL(file))
    setGames([])
    setMessage('전적 화면을 경기 순서대로 분석하고 있습니다.')
    setProcessing(true)
    let currentGame = 1
    try {
      const analyzed = []
      const foundDiagnostics = []
      for (let index = 0; index < files.length; index += 1) {
        currentGame = index + 1
        setMessage(String(index + 1) + '경기 전적 화면을 분석하고 있습니다.')
        const outcome = await readOutcome(files[index])
        const scoreboard = await readScoreboard(files[index], progress =>
          setMessage(String(index + 1) + '경기 · ' + progress))
        if (scoreboard.rows.length !== 10) {
          throw new Error(String(index + 1) + '경기에서 선수 10명을 구분하지 못했습니다.')
        }
        foundDiagnostics.push(...scoreboard.diagnostics.map(item => ({
          ...item, gameNumber: index + 1,
        })))
        analyzed.push({
          gameNumber: index + 1, outcome, uploaderTeam: '', reviewed: false,
          recognizedCount: scoreboard.recognizedCount,
          recognizedNameCount: scoreboard.recognizedNameCount,
          rows: scoreboard.rows.map(({ kills, deaths, assists, riotName, recognized, recognizedName }) => ({
            kills, deaths, assists, riotName, recognized, recognizedName,
            riotNameInput: riotName,
            kdaInput: recognized ? kills + '/' + deaths + '/' + assists : '',
          })),
          previewUrl: previewUrls.current[index],
        })
      }
      const wins = analyzed.filter((game) => game.outcome === 'victory').length
      const losses = analyzed.length - wins
      if ((analyzed.length === 2 && wins === 1) || (analyzed.length === 3 && (wins === 0 || wins === 3))) {
        analyzed.forEach((game) => URL.revokeObjectURL(game.previewUrl))
        throw new Error(analyzed.length === 2
          ? '1승 1패이므로 세 번째 경기 캡처도 함께 올려주세요.'
          : '3판 2선승 경기에서 같은 결과가 3번입니다. 실제 진행한 경기 캡처만 올려주세요.')
      }
      previewUrls.current = analyzed.map((game) => game.previewUrl)
      setDiagnostics(foundDiagnostics)
      setGames(analyzed)
      setMessage('시리즈 인식 결과: ' + wins + '승 ' + losses +
        '패. 자동 입력된 값과 빈칸을 확인한 뒤 경기별 검증 완료를 눌러주세요.')
    } catch (error) {
      setDiagnostics(error.diagnostics || [])
      setMessage(currentGame + '경기 · ' + (error.message || '이미지를 읽지 못했습니다.'))
    } finally {
      setProcessing(false)
      event.target.value = ''
    }
  }

  return <section className="match-screenshot-panel">
    <h3>전적 화면 업로드</h3>
    <p>2장 또는 3장의 전적 화면을 경기 순서대로 한 번에 선택해주세요.</p>
    <label className="match-screenshot-picker">
      스크린샷 2~3장 선택
      <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={onFileChange} disabled={processing} />
    </label>

    {currentGame && !allGamesReviewed && <div className="match-series-previews">
      <p className="match-review-progress">{currentGame.gameNumber}/{games.length}경기 검증 중</p>
      <article className="match-capture-card">
        <figure>
          <img className="match-screenshot-image" src={currentGame.previewUrl} alt={String(currentGame.gameNumber) + '경기 전적 화면'} />
          <figcaption>{currentGame.gameNumber}경기 · {currentGame.outcome === 'victory' ? '승리' : '패배'}</figcaption>
        </figure>
        <div className="match-kda-review">
          <h4>참가자 검증 · 닉네임 {currentGame.recognizedNameCount}/10 · K/D/A {currentGame.recognizedCount}/10 자동 인식</h4>
          <p>스크린샷과 비교해 확인하세요. 빈칸이나 잘못 읽은 값은 직접 수정할 수 있습니다.</p>
          {currentGame.rows.map((row, index) => {
            const valid = Boolean(parseKdaInput(row.kdaInput))
            return <div className="match-kda-review-row" key={index}>
              <span>{index + 1}.</span>
              <label>
                <span className="sr-only">{index + 1}번째 선수 닉네임</span>
                <input value={row.riotNameInput} placeholder="닉네임 직접 입력"
                  aria-invalid={!validName(row.riotNameInput)}
                  onChange={event => updateName(currentGame.gameNumber, index, event.target.value)} />
              </label>
              <label>
                <span className="sr-only">{index + 1}번째 선수 K/D/A</span>
              <input value={row.kdaInput} placeholder="0/0/0" inputMode="numeric"
                  aria-invalid={!valid} onChange={event => updateKda(currentGame.gameNumber, index, event.target.value)} />
              </label>
              <small>{row.recognizedName && row.recognized ? '자동 입력' : '확인 필요'}</small>
            </div>
          })}
        </div>
        <fieldset className="match-capture-game-team" disabled={processing}>
          <legend>{currentGame.gameNumber}경기에서 나는 어느 팀이었나요?</legend>
          <div className="match-capture-team-buttons">
            {['BLUE', 'RED'].map((team) => <button key={team} type="button"
              aria-pressed={currentGame.uploaderTeam === team}
              onClick={() => selectTeam(currentGame.gameNumber, team)}>
              {team === 'BLUE' ? '블루팀' : '레드팀'}{currentGame.uploaderTeam === team ? ' ✓' : ''}
            </button>)}
          </div>
        </fieldset>
        <button type="button" className="match-capture-confirm"
          disabled={!gameIsValid(currentGame)}
          onClick={() => reviewGame(currentGame.gameNumber)}>
          {currentGame.gameNumber < games.length
            ? currentGame.gameNumber + '경기 검증 완료 후 ' + (currentGame.gameNumber + 1) + '경기로'
            : currentGame.gameNumber + '경기 검증 완료'}
        </button>
      </article>
    </div>}

    {allGamesReviewed && <aside className="match-capture-controls">
      <p>시리즈 전적: <strong>{victories}승 {defeats}패</strong></p>
      <p>모든 경기의 닉네임, K/D/A, 팀 검증이 완료되었습니다.</p>
      {winner && <p className="match-capture-winner">
        최종 경기 결과: <strong>{winner === 'BLUE' ? '블루팀' : '레드팀'} 승리</strong>
      </p>}
      <div className="match-review-edit-buttons">
        {games.map(game => <button type="button" key={game.gameNumber}
          onClick={() => editGame(game.gameNumber)}>{game.gameNumber}경기 다시 확인</button>)}
      </div>
      <button type="button" className="match-capture-confirm"
        disabled={busy || processing || !allGamesReviewed || !winner}
        onClick={() => onConfirm({ winner, seriesOutcome, games })}>
        {busy ? '경기 결과 저장 중...' : '경기 결과 확정'}
      </button>
    </aside>}

    {message && <p role="status" className="match-screenshot-message">{message}</p>}
    {diagnostics.some(item => !currentGame || item.gameNumber === currentGame.gameNumber) && <details open className="match-capture-controls">
      <summary>확인이 필요한 인식 영역</summary>
      <p>실제로 잘라 읽은 영역입니다. 닉네임이나 숫자가 잘렸는지 확인하고 위 입력칸에서 직접 수정할 수 있습니다.</p>
      {diagnostics.filter(item => !currentGame || item.gameNumber === currentGame.gameNumber).map(item => <figure key={(item.gameNumber || '') + '-' + item.kind + '-' + item.row}>
        <figcaption>{item.gameNumber ? item.gameNumber + '경기 · ' : ''}{item.label || item.row + '번째 선수'}</figcaption>
        {item.image && <img src={item.image} alt={item.label || item.row + '번째 선수 인식 영역'} style={{ maxWidth: '100%', height: 'auto' }} />}
        <p>읽은 값: {item.attempts.map(attempt =>
          (attempt.text || '읽지 못함') + ' (신뢰도 ' + attempt.confidence + '%)').join(' · ')}</p>
      </figure>)}
    </details>}
  </section>
}
