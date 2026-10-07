import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { startQueuePolling } from './lib/queuePolling'
import AdminPage from './components/AdminPage'
import MemberSheetPage from './components/MemberSheetPage'
import ProfileAliases, { AliasNames } from './components/ProfileAliases'
import MostChampions from './components/MostChampions'

import MatchReplayReview from './components/MatchReplayReview'
import MatchHistoryTeams from './components/MatchHistoryTeams'
import { apiRequest, authenticatedFetch } from './lib/api'
import { initialRatingFromScore } from './lib/rating'
import { LeagueUploadPage, LeagueApplicationsPage } from './components/LeaguePages'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState('home')
  const [signup, setSignup] = useState({ username: '', password: '', real_name: '', birth_date: '', lol_nickname: '', main_position: 'TOP', sub_position: '', initial_internal_score: '' })
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupError, setSignupError] = useState('')
  const [matchHistory, setMatchHistory] = useState([])

  const [profileData, setProfileData] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
const [rankingData, setRankingData] = useState([])
const [rankingLoading, setRankingLoading] = useState(false)
const [rankingError, setRankingError] = useState('')
const [memberSearch, setMemberSearch] = useState('')
const [memberResults, setMemberResults] = useState([])
const [memberLoading, setMemberLoading] = useState(false)
const [memberError, setMemberError] = useState('')
const [memberSearched, setMemberSearched] = useState(false)
const [queueData, setQueueData] = useState(null)
const [queueLoading, setQueueLoading] = useState(false)
const [matchCancelling, setMatchCancelling] = useState(false)
const activeMatchId = queueData?.active_match?.id
const isQueued = Boolean(queueData?.queue || queueData?.queued)
const notifiedMatchId = useRef(null)
const [queueError, setQueueError] = useState('')
const [queuePrimary, setQueuePrimary] = useState('')
const [queueSecondary, setQueueSecondary] = useState('')
const [positionAssignments, setPositionAssignments] = useState({})
const [leagueData, setLeagueData] = useState([])
const [leagueLoading, setLeagueLoading] = useState(false)
const [leagueError, setLeagueError] = useState('')
const [leagueForm, setLeagueForm] = useState({ league_id: '', real_name: '', lol_nickname: '', tier: '', internal_score: '', main_position: 'TOP', sub_position: 'JUNGLE', appeal: '' })
const [leagueFormError, setLeagueFormError] = useState('')
const [leagueFormMessage, setLeagueFormMessage] = useState('')

const [applicationLeagueId, setApplicationLeagueId] = useState(null)
const [leagueSubmitting, setLeagueSubmitting] = useState(false)
const [appliedLeagueIds, setAppliedLeagueIds] = useState([])
const openLeagueApplications = leagueId => { setApplicationLeagueId(leagueId); setPage('league-applications') }
const leagueRequest = useCallback(async (endpoint, method = 'GET', body) => {
  const response = await authenticatedFetch(`${supabaseUrl}/functions/v1/${endpoint}`, {
    method, headers: { Authorization: `Bearer ${localStorage.getItem('lolex_access_token')}`, apikey: supabaseKey, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok || data.success === false) throw new Error(data.error || '리그 요청을 처리하지 못했습니다. 다시 시도해주세요.')
  return data
}, [])
const manageLeague = async (method, leagueId) => {
  if (!window.confirm(method === 'DELETE' ? '이 리그를 삭제할까요?' : '리그 접수를 종료할까요?')) return
  setLeagueSubmitting(true); setLeagueError('')
  try { await leagueRequest('lolex-league-admin', method, { league_id: leagueId }); await openLeague() }
  catch (err) { setLeagueError(err.message) }
  finally { setLeagueSubmitting(false) }
}
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('lolex_user')

    if (!savedUser) {
      return null
    }

    try {
      return JSON.parse(savedUser)
    } catch {
      return null
    }
  })


  const loadMatchHistory = async () => {
    const accessToken = localStorage.getItem('lolex_access_token')
    if (!accessToken) return
    try {
      const response = await authenticatedFetch(`${supabaseUrl}/functions/v1/lolex-match-history`)
      const data = await response.json()
      if (response.ok && data.success) setMatchHistory(data.matches || [])
    } catch (err) { console.error(err) }
  }
  const openMatchHistory = async () => {
    setPage('history')
    await loadMatchHistory()
  }

  useEffect(() => { if (user && page === 'home') loadMatchHistory() }, [user, page])

  const handleSignup = async (e) => {
    e.preventDefault(); setSignupError(''); setSignupLoading(true)
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/lolex-signup`, { method: 'POST', headers: { apikey: supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...signup, sub_position: signup.sub_position || null }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || '회원가입에 실패했습니다.')
      alert('회원가입이 완료되었습니다. 운영자 승인 후 로그인할 수 있습니다.')
      setSignup({ username: '', password: '', real_name: '', birth_date: '', lol_nickname: '', main_position: 'TOP', sub_position: '', initial_internal_score: '' })
      setPage('login')
    } catch (err) { setSignupError(err.message) } finally { setSignupLoading(false) }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    setError('')

    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력해주세요.')
      return
    }

    if (!supabaseUrl || !supabaseKey) {
      setError('Supabase 환경변수가 설정되지 않았습니다.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/lolex-login`,
        {
          method: 'POST',
          headers: {
            apikey: supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: username.trim(),
            password,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          data.message ||
          '아이디 또는 비밀번호가 올바르지 않습니다.'
        )
      }

      if (data.session?.access_token) {
        localStorage.setItem(
          'lolex_access_token',
          data.session.access_token
        )
      }

      if (data.session?.refresh_token) {
        localStorage.setItem(
          'lolex_refresh_token',
          data.session.refresh_token
        )
      }

      if (data.user) {
        localStorage.setItem(
          'lolex_user',
          JSON.stringify(data.user)
        )

        setUser(data.user)
      } else {
        const fallbackUser = {
          username: username.trim(),
        }

        localStorage.setItem(
          'lolex_user',
          JSON.stringify(fallbackUser)
        )

        setUser(fallbackUser)
      }

      setPassword('')
      setPage('home')
    } catch (err) {
      console.error(err)

      setError(
        err.message ||
        '로그인 중 오류가 발생했습니다.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('lolex_access_token')
    localStorage.removeItem('lolex_refresh_token')
    localStorage.removeItem('lolex_user')

    setQueueData(null)
    setUser(null)
    setUsername('')
    setPassword('')
    setError('')
    setPage('home')
    setProfileData(null)
  }
  useEffect(() => {
    const handleExpiredSession = () => {
      setQueueData(null)
      setUser(null)
      setPage('login')
      setProfileData(null)
      setError('로그인이 만료되었습니다. 다시 로그인해주세요.')
    }
    window.addEventListener('lolex:session-expired', handleExpiredSession)
    return () => window.removeEventListener('lolex:session-expired', handleExpiredSession)
  }, [])
  const openMyProfile = async () => {
    const accessToken =
      localStorage.getItem('lolex_access_token')

    if (!accessToken) {
      handleLogout()
      return
    }

    setPage('profile')
    setProfileLoading(true)
    setProfileError('')

    try {
      const response = await authenticatedFetch(
        `${supabaseUrl}/functions/v1/lolex-my-profile`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseKey,
          },
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ||
          data.error ||
          '내 정보를 불러오지 못했습니다.'
        )
      }

      setProfileData(data)
    } catch (err) {
      console.error(err)

      setProfileError(
        err.message ||
        '내 정보를 불러오는 중 오류가 발생했습니다.'
      )
    } finally {
      setProfileLoading(false)
    }
  }

  const openRanking = async () => {
    const accessToken =
      localStorage.getItem('lolex_access_token')

    if (!accessToken) {
      handleLogout()
      return
    }

    setPage('ranking')
    setRankingLoading(true)
    setRankingError('')

    try {
      const response = await authenticatedFetch(
        `${supabaseUrl}/functions/v1/lolex-members`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseKey,
          },
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          data.message ||
          '랭킹을 불러오지 못했습니다.'
        )
      }

      setRankingData(data.members || [])
    } catch (err) {
      console.error(err)

      setRankingError(
        err.message ||
        '랭킹을 불러오는 중 오류가 발생했습니다.'
      )
    } finally {
      setRankingLoading(false)
    }
  }

  const openMemberSearch = () => {
    setMemberSearch('')
    setMemberResults([])
    setMemberError('')
    setMemberSearched(false)
    setPage('members')
  }
const openQueue = async () => {
  const accessToken =
    localStorage.getItem('lolex_access_token')

  if (!accessToken) {
    handleLogout()
    return
  }

  setPage('queue')
  setQueueLoading(true)
  setQueueError('')

  try {
    const response = await authenticatedFetch(
      `${supabaseUrl}/functions/v1/lolex-queue`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
        },
      }
    )

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        data.message ||
        '매칭 대기 정보를 불러오지 못했습니다.'
      )
    }

    setQueueData(data)
    if (['matched', 'in_progress'].includes(data.active_match?.status)) {
  setPage('match')
  return
}

if (data.active_match?.status === 'position_discussion') {
  setPage('match')
  return
}

    if (data.queue) {
      setQueuePrimary(data.queue.primary_position || '')
      setQueueSecondary(data.queue.primary_position === 'ALL' ? '' : data.queue.secondary_position || '')
    }
  } catch (err) {
    console.error(err)

    setQueueError(
      err.message ||
      '매칭 대기 정보를 불러오는 중 오류가 발생했습니다.'
    )
  } finally {
    setQueueLoading(false)
  }
}
useEffect(() => {
  if (!user) { notifiedMatchId.current = null; return }
  if (!activeMatchId || notifiedMatchId.current === activeMatchId) return
  notifiedMatchId.current = activeMatchId
  setPage('match')
  alert(queueData.active_match.status === 'position_discussion'
    ? '10명이 모였습니다!\n포지션 협의가 필요합니다.'
    : '10명이 모였습니다!\n매칭이 완료되었습니다.')
}, [user, activeMatchId, queueData?.active_match?.status])

useEffect(() => {
  if (!user || queueLoading || activeMatchId || (page !== 'queue' && !isQueued)) return
  const polling = startQueuePolling({
    load: signal => apiRequest('lolex-queue', { signal }),
    onData: data => { setQueueData(data); setQueueError('') },
  })
  const refreshVisible = () => { if (document.visibilityState === 'visible') polling.refresh() }
  window.addEventListener('focus', polling.refresh)
  document.addEventListener('visibilitychange', refreshVisible)
  return () => {
    polling.stop()
    window.removeEventListener('focus', polling.refresh)
    document.removeEventListener('visibilitychange', refreshVisible)
  }
}, [user, page, isQueued, activeMatchId, queueLoading])
// Other participants also leave the match screen once this match is cancelled.
// Do not call openQueue here: it changes pages and would discard review drafts.
useEffect(() => {
  if (page !== 'match' || !activeMatchId || matchCancelling || queueLoading) return
  const controller = new AbortController()
  let timer
  const checkMatch = async () => {
    try {
      const response = await authenticatedFetch(`${supabaseUrl}/functions/v1/lolex-queue`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('lolex_access_token')}`, apikey: supabaseKey },
        signal: controller.signal,
      })
      const data = await response.json()
      if (controller.signal.aborted) return
      if (response.ok && data.success && String(data.active_match?.id) !== String(activeMatchId)) {
        setQueueData(data)
        setPositionAssignments({})
        setQueueError('')
        setPage(data.active_match ? 'match' : 'queue')
        return
      }
    } catch {
      // Keep unsaved review data during temporary connection failures.
    }
    if (!controller.signal.aborted) timer = setTimeout(checkMatch, 10000)
  }
  timer = setTimeout(checkMatch, 10000)
  return () => { controller.abort(); clearTimeout(timer) }
}, [page, activeMatchId, matchCancelling, queueLoading])
const joinQueue = async () => {
  if (!queuePrimary || (queuePrimary !== 'ALL' && !queueSecondary)) {
    setQueueError('주 포지션과 부 포지션을 모두 선택해주세요.')
    return
  }

  if (queuePrimary !== 'ALL' && queuePrimary === queueSecondary) {
    setQueueError('주 포지션과 부 포지션은 서로 다르게 선택해주세요.')
    return
  }

  const accessToken =
    localStorage.getItem('lolex_access_token')

  if (!accessToken) {
    handleLogout()
    return
  }

  setQueueLoading(true)
  setQueueError('')

  try {
    const response = await authenticatedFetch(
      `${supabaseUrl}/functions/v1/lolex-queue`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primary_position: queuePrimary,
          secondary_position: queueSecondary,
        }),
      }
    )

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        data.message ||
        '매칭 신청에 실패했습니다.'
      )
    }
    setQueueData(data)
    await openQueue()
    if (data.matchmaking?.success === false) {
      setQueueError(data.matchmaking.error || data.matchmaking.message || '매칭 신청은 유지되어 있지만 자동 팀 배정에 실패했습니다.')
    }
  } catch (err) {
    console.error(err)

    setQueueError(
      err.message ||
      '매칭 신청 중 오류가 발생했습니다.'
    )
  } finally {
    setQueueLoading(false)
  }
}
const leaveQueue = async () => {
  const accessToken =
    localStorage.getItem('lolex_access_token')

  if (!accessToken) {
    handleLogout()
    return
  }

  setQueueLoading(true)
  setQueueError('')

  try {
    const response = await authenticatedFetch(
      `${supabaseUrl}/functions/v1/lolex-queue`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
        },
      }
    )

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        data.message ||
        '매칭 신청 취소에 실패했습니다.'
      )
    }

    setQueueData(data)
    setQueuePrimary('')
    setQueueSecondary('')
    await openQueue()
  } catch (err) {
    console.error(err)

    setQueueError(
      err.message ||
      '매칭 신청 취소 중 오류가 발생했습니다.'
    )
  } finally {
    setQueueLoading(false)
  }
}
const cancelActiveMatch = async () => {
  const matchId = queueData?.active_match?.id
  if (!matchId || matchCancelling || queueLoading) return
  if (!window.confirm('이 매칭을 전체 취소할까요?\n10명 모두의 매칭이 해제되며 다시 신청해야 합니다.\n저장하지 않은 검수 내용은 사라지고, 전적과 레이팅은 변경되지 않습니다.')) return
  setMatchCancelling(true)
  setQueueError('')
  try {
    await apiRequest('lolex-match-cancel', { method: 'POST', body: { match_id: matchId } })
    setQueueData(null)
    setPositionAssignments({})
    setQueuePrimary('')
    setQueueSecondary('')
    await openQueue()
  } catch (err) {
    setQueueError(err.message || '매칭 취소에 실패했습니다. 다시 시도해주세요.')
  } finally {
    setMatchCancelling(false)
  }
}
const openLeague = async () => {
  const accessToken =
    localStorage.getItem('lolex_access_token')

  if (!accessToken) {
    handleLogout()
    return
  }

  setPage('league')
  setLeagueLoading(true)
  setLeagueError('')

  try {
    const response = await authenticatedFetch(
      `${supabaseUrl}/functions/v1/lolex-leagues`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
        },
      }
    )

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        data.message ||
        '리그 정보를 불러오지 못했습니다.'
      )
    }

    setLeagueData(data.leagues || [])
  } catch (err) {
    console.error(err)

    setLeagueError(
      err.message ||
      '리그 정보를 불러오는 중 오류가 발생했습니다.'
    )
  } finally {
    setLeagueLoading(false)
  }
}
const submitLeagueApplication = async (e) => {
  e.preventDefault()
  if (leagueSubmitting) return
  setLeagueFormError(''); setLeagueFormMessage(''); setLeagueSubmitting(true)
  try {
    await leagueRequest('lolex-league-register', 'POST', { ...leagueForm, league_id: Number(leagueForm.league_id) })
    setAppliedLeagueIds(ids => [...new Set([...ids, Number(leagueForm.league_id)])])
    setLeagueFormMessage('리그 신청 접수가 완료되었습니다. 어필 한 마디도 함께 전달되었습니다.')
  } catch (err) { setLeagueFormError(err.message) }
  finally { setLeagueSubmitting(false) }
}
const openAdminPage = () => setPage('admin')
const confirmPositionAssignments = async () => {
  const accessToken =
    localStorage.getItem('lolex_access_token')

  if (!accessToken) {
    handleLogout()
    return
  }

  const matchId = queueData?.active_match?.id
  const players = queueData?.match_players ?? []

  if (!matchId) {
    setQueueError('경기 정보를 찾을 수 없습니다.')
    return
  }

  const assignments = players.map((player) => ({
    user_id: player.user_id,
    position: positionAssignments[player.user_id] || '',
  }))

  if (
    assignments.length !== 10 ||
    assignments.some((assignment) => !assignment.position)
  ) {
    setQueueError('10명의 최종 포지션을 모두 선택해주세요.')
    return
  }

  const positionCounts = {
    TOP: 0,
    JUNGLE: 0,
    MID: 0,
    ADC: 0,
    SUPPORT: 0,
  }

  assignments.forEach((assignment) => {
    if (positionCounts[assignment.position] !== undefined) {
      positionCounts[assignment.position] += 1
    }
  })

  const validPositions = Object.values(positionCounts).every(
    (count) => count === 2
  )

  if (!validPositions) {
    setQueueError(
      'TOP, JUNGLE, MID, ADC, SUPPORT를 각각 2명씩 지정해주세요.'
    )
    return
  }

  const confirmed = window.confirm(
    '현재 선택한 포지션으로 확정하시겠습니까?'
  )

  if (!confirmed) {
    return
  }

  setQueueLoading(true)
  setQueueError('')

  try {
    const response = await authenticatedFetch(
      `${supabaseUrl}/functions/v1/lolex-match-positions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          match_id: matchId,
          assignments,
        }),
      }
    )

    const data = await response.json()

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        data.message ||
        '포지션 확정에 실패했습니다.'
      )
    }

    alert('포지션이 확정되었습니다.')

    setPositionAssignments({})

    await openQueue()
  } catch (err) {
    console.error(err)

    setQueueError(
      err.message ||
      '포지션 확정 중 오류가 발생했습니다.'
    )
  } finally {
    setQueueLoading(false)
  }
}
  const searchMembers = async (e) => {
    e.preventDefault()

    const searchText = memberSearch.trim()

    if (!searchText) {
      setMemberError('검색할 롤 닉네임을 입력해주세요.')
      setMemberResults([])
      setMemberSearched(false)
      return
    }

    const accessToken =
      localStorage.getItem('lolex_access_token')

    if (!accessToken) {
      handleLogout()
      return
    }

    setMemberLoading(true)
    setMemberError('')
    setMemberSearched(true)

    try {
      const response = await authenticatedFetch(
        `${supabaseUrl}/functions/v1/lolex-members?search=${encodeURIComponent(searchText)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseKey,
          },
        }
      )

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          data.message ||
          '회원 검색에 실패했습니다.'
        )
      }

      setMemberResults(data.members || [])
    } catch (err) {
      console.error(err)

      setMemberResults([])
      setMemberError(
        err.message ||
        '회원 검색 중 오류가 발생했습니다.'
      )
    } finally {
      setMemberLoading(false)
    }
  }
  if (user && page === 'history') {
    return <div className="app"><main className="dashboard-page">
      <header className="dashboard-header"><h1>최근 경기</h1><button type="button" className="logout-button" onClick={() => setPage('home')}>메인으로</button></header>
      <section className="record-panel match-history-panel">
        <div className="section-title"><p>MATCH HISTORY</p><h2>최근 경기</h2></div>
        {matchHistory.length === 0 ? <p className="empty-state">최근 경기가 없습니다.</p> : <div className="match-history-list">
          {matchHistory.map(match => <article className="match-history-item" key={match.id}>
            <div><strong>#{match.id} · {match.winner === 'BLUE' ? '블루팀 승리' : '레드팀 승리'}</strong><small>{new Date(match.finished_at || match.created_at).toLocaleString('ko-KR')}</small></div>
            {match.games?.length ? match.games.map(game => <details className="history-set" key={game.game_number} open>
              <summary><span>{game.game_number}세트</span><strong>{game.winner === 'BLUE' ? '블루팀 승리' : '레드팀 승리'}</strong></summary>
              <MatchHistoryTeams players={game.replay_participants} winner={game.winner} />
            </details>) : <MatchHistoryTeams players={match.players} winner={match.winner} />}
          </article>)}
        </div>}
      </section>
    </main></div>
  }

  if (page === 'match') {
  return (
    <div className="app">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <main className="dashboard-page">
        <header className="dashboard-header">
          <div className="brand dashboard-brand">
            <div className="brand-mark">L</div>

            <div>
              <h1>LOLEX</h1>
              <p>League of Legends Community</p>
            </div>
          </div>
        </header>

        {queueData?.active_match?.status === 'position_discussion' ? (
  <section className="welcome-panel">
    <p className="welcome-label">
      POSITION DISCUSSION
    </p>

    <h2>포지션 협의가 필요합니다.</h2>

    <p>
      10명의 희망 포지션을 확인하고 포지션을 조정해주세요.
    </p>
  </section>
) : (
  <section className="welcome-panel">
    <p className="welcome-label">
      MATCH FOUND
    </p>

    <h2>매칭이 성사되었습니다!</h2>

    <p>
      10명의 플레이어가 매칭되었습니다.
    </p>
  </section>
)}

<section className="queue-panel">
  <div className="match-cancel-bar">
    <div><strong>매칭 관리</strong><p>취소하면 10명 모두의 매칭이 해제됩니다. 다시 참여하려면 매칭을 신청해주세요.</p></div>
    <button type="button" className="queue-cancel-button" onClick={cancelActiveMatch} disabled={matchCancelling || queueLoading}>
      {matchCancelling ? '매칭 취소 중…' : '매칭 취소'}
    </button>
  </div>
  {queueError && <p className="login-error" role="alert">{queueError}</p>}
  <fieldset className="match-content" disabled={matchCancelling}>
  {queueData?.active_match?.status === 'position_discussion' && (
  <div className="position-discussion">
    <div className="position-discussion-list">
      {queueData?.match_players?.map((player) => (
        <div
  className="position-discussion-player"
  key={player.user_id}
>
  <strong>{player.lol_nickname}</strong>

  <div>
    <span>
      주 포지션: {player.requested_primary_position}
    </span>

    <span>
      부 포지션: {player.requested_primary_position === 'ALL' ? '없음' : player.requested_secondary_position}
    </span>
  </div>

    <select
  value={positionAssignments[player.user_id] || ''}
  onChange={(e) =>
    setPositionAssignments((prev) => ({
      ...prev,
      [player.user_id]: e.target.value,
    }))
  }
    >
      <option value="">최종 포지션 선택</option>
      <option value="TOP">TOP</option>
      <option value="JUNGLE">JUNGLE</option>
      <option value="MID">MID</option>
      <option value="ADC">ADC</option>
      <option value="SUPPORT">SUPPORT</option>
    </select>
  
</div>
            ))}
    </div>

    <button
  type="button"
  className="queue-submit-button"
  onClick={confirmPositionAssignments}
  disabled={queueLoading}
>
  {queueLoading ? '확정 중...' : '포지션 확정'}
</button>
  </div>
)}

{queueData?.active_match?.status !== 'position_discussion' && (
  <div className="match-teams">
    <div className="match-team match-team-blue">
      <div className="match-team-header">
  <span>BLUE TEAM</span>

  <strong className="match-team-score">
    {queueData?.match_players
      ?.filter((player) => player.team === 'BLUE')
      .reduce(
        (total, player) =>
          total + (player.position_rating_before ?? 0),
        0
      )}
  </strong>
</div>

      <div className="match-team-list">
        {['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].map(
          (position) => {
            const player =
              queueData?.match_players?.find(
                (item) =>
                  item.team === 'BLUE' &&
                  item.position === position
              )

            return (
              <div
                className="match-player-row"
                key={`BLUE-${position}`}
              >
                <span className="match-player-position">
                  {position}
                </span>

                <div className="match-player-info">
  <strong>
    {player?.lol_nickname || '플레이어 대기 중'}
  </strong>

  {player?.position_rating_before != null && (
    <span className="match-player-rating">
      {player.position_rating_before}
    </span>
  )}
</div>
              </div>
            )
          }
        )}
      </div>
    </div>

    <div className="match-team match-team-red">
      <div className="match-team-header">
  <span>RED TEAM</span>

  <strong className="match-team-score">
    {queueData?.match_players
      ?.filter((player) => player.team === 'RED')
      .reduce(
        (total, player) =>
          total + (player.position_rating_before ?? 0),
        0
      )}
  </strong>
</div>

      <div className="match-team-list">
        {['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'].map(
          (position) => {
            const player =
              queueData?.match_players?.find(
                (item) =>
                  item.team === 'RED' &&
                  item.position === position
              )

            return (
              <div
                className="match-player-row"
                key={`RED-${position}`}
              >
                <span className="match-player-position">
                  {position}
                </span>

                <div className="match-player-info">
  <strong>
    {player?.lol_nickname || '플레이어 대기 중'}
  </strong>

  {player?.position_rating_before != null && (
    <span className="match-player-rating">
      {player.position_rating_before}
    </span>
  )}
</div>
              </div>
            )
          }
        )}
      </div>
    </div>
  </div>
  )}
  {queueData?.active_match?.status !== 'position_discussion' && (
  <div className="match-result-admin">
    <MatchReplayReview key={queueData?.active_match?.id} matchId={queueData?.active_match?.id} players={queueData?.match_players || []} onSaved={openMatchHistory} />


  </div>
)}
</fieldset>
</section>
      </main>
    </div>
  )
}
      if (page === 'queue') {
      return (
        <div className="app">
          <div className="background-glow glow-one"></div>
          <div className="background-glow glow-two"></div>

          <main className="dashboard-page">
            <header className="dashboard-header">
              <div className="brand dashboard-brand">
                <div className="brand-mark">L</div>

                <div>
                  <h1>LOLEX</h1>
                  <p>League of Legends Community</p>
                </div>
              </div>

              <button
                type="button"
                className="logout-button"
                onClick={() => setPage('home')}
              >
                ← 메인으로
              </button>
            </header>

            <section className="welcome-panel">
              <p className="welcome-label">
                MATCH QUEUE
              </p>

              <h2>매칭 신청</h2>

              <p>
                플레이할 포지션을 선택하고 매칭 대기열에 참가합니다.
              </p>
            </section>

            {queueLoading && (
              <section className="profile-status-card">
                매칭 대기 정보를 불러오는 중입니다...
              </section>
            )}

            {queueError && (
              <section className="profile-status-card profile-error">
                {queueError}
              </section>
            )}

            {!queueLoading && !queueError && (
              <section className="queue-panel">
                <div className="queue-position-grid">
                  <div className="queue-position-box">
                    <label htmlFor="queue-primary">
                      주 포지션
                    </label>

                    <select
                      id="queue-primary"
                      value={queuePrimary}
                      onChange={(e) => {
                        const position = e.target.value
                        setQueuePrimary(position)
                        if (position === 'ALL') setQueueSecondary('')
                      }}
                    >
                      <option value="">
                        주 포지션 선택
                      </option>
                      <option value="ALL">ALL (모든 포지션)</option>
                      <option value="TOP">TOP</option>
                      <option value="JUNGLE">JUNGLE</option>
                      <option value="MID">MID</option>
                      <option value="ADC">ADC</option>
                      <option value="SUPPORT">SUPPORT</option>
                    </select>
                  </div>

                  <div className="queue-position-box">
                    <label htmlFor="queue-secondary">
                      부 포지션
                    </label>

                    <select
                      id="queue-secondary"
                      value={queueSecondary}
                      disabled={queuePrimary === 'ALL'}
                      onChange={(e) =>
                        setQueueSecondary(e.target.value)
                      }
                    >
                      <option value="">
                        {queuePrimary === 'ALL' ? 'ALL 선택 시 사용하지 않음' : '부 포지션 선택'}
                      </option>
                      <option value="TOP">TOP</option>
                      <option value="JUNGLE">JUNGLE</option>
                      <option value="MID">MID</option>
                      <option value="ADC">ADC</option>
                      <option value="SUPPORT">SUPPORT</option>
                    </select>
                  </div>
                </div>

                <div className="queue-guide">
                  <span>매칭 대기</span>

                  <strong>
                    {queueData?.queue
                      ? '현재 매칭 대기열에 참가 중입니다.'
                      : '현재 매칭 대기열에 참가하지 않았습니다.'}
                  </strong>
                </div>
                <div className="queue-guide">
  <span>현재 대기 인원</span>
  <strong>{queueData?.queue_count ?? 0} / 10명</strong>
</div>
<section className="queue-roster" aria-label="매칭 신청자 명단">
  <div className="queue-roster-heading"><h3>매칭 신청자</h3><small>점수는 종합 레이팅 기준입니다.</small></div>
  {Array.isArray(queueData?.queue_members) ? (
    queueData.queue_members.length ? <div className="queue-roster-scroll"><table>
      <thead><tr><th scope="col">이름</th><th scope="col">닉네임</th><th scope="col">주 포지션</th><th scope="col">부 포지션</th><th scope="col">점수</th></tr></thead>
      <tbody>{queueData.queue_members.map(member => <tr key={member.user_id}>
        <td>{member.real_name}{member.user_id === (user.id || user.user_id) && <small className="queue-roster-self">나</small>}</td>
        <td>{member.lol_nickname}</td><td>{member.primary_position}</td><td>{member.primary_position === 'ALL' ? '없음' : member.secondary_position || '없음'}</td>
        <td>{member.overall_rating == null ? '—' : Number(member.overall_rating).toLocaleString('ko-KR')}</td>
      </tr>)}</tbody>
    </table></div> : <p className="queue-roster-empty">아직 매칭 신청자가 없습니다. 첫 번째로 참여해보세요.</p>
  ) : <p className="queue-roster-empty">신청자 명단을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.</p>}
</section>
{queueData?.active_match?.status === 'matched' && (
  <div className="queue-guide">
    <span>매칭 상태</span>
    <strong>매칭이 성사되었습니다!</strong>
  </div>
)}

{queueData?.active_match?.status === 'position_discussion' && (
  <div className="queue-guide">
    <span>매칭 상태</span>
    <strong>포지션 협의가 필요합니다.</strong>
  </div>
)}
                {!queueData?.queue && (
                  
  <button
    type="button"
    className="queue-submit-button"
    onClick={joinQueue}
    disabled={queueLoading}
  >
    {queueLoading ? '신청 중...' : '매칭 신청하기'}
  </button>
)}
{queueData?.queue && (
  <button
    type="button"
    className="queue-cancel-button"
    onClick={leaveQueue}
    disabled={queueLoading}
  >
    {queueLoading ? '취소 중...' : '매칭 신청 취소'}
  </button>
)}
              </section>
            )}
          </main>
        </div>
      )
    }
      if (page === 'members') {
      return (
        <div className="app">
          <div className="background-glow glow-one"></div>
          <div className="background-glow glow-two"></div>

          <main className="dashboard-page">
            <header className="dashboard-header">
              <div className="brand dashboard-brand">
                <div className="brand-mark">L</div>

                <div>
                  <h1>LOLEX</h1>
                  <p>League of Legends Community</p>
                </div>
              </div>

              <button
                type="button"
                className="logout-button"
                onClick={() => setPage('home')}
              >
                ← 메인으로
              </button>
            </header>

            <section className="welcome-panel">
              <p className="welcome-label">
                MEMBER SEARCH
              </p>

              <h2>회원 검색</h2>

              <p>
                롤 닉네임으로 LOLEX 회원을 검색합니다.
              </p>
            </section>

            <form
              className="member-search-form"
              onSubmit={searchMembers}
            >
              <input
                type="text"
                className="member-search-input"
                placeholder="롤 닉네임을 입력하세요"
                value={memberSearch}
                onChange={(e) =>
                  setMemberSearch(e.target.value)
                }
              />

              <button
                type="submit"
                className="member-search-button"
                disabled={memberLoading}
              >
                {memberLoading ? '검색 중...' : '검색'}
              </button>
            </form>

            {memberError && (
              <section className="profile-status-card profile-error">
                {memberError}
              </section>
            )}

            {memberSearched &&
              !memberLoading &&
              !memberError &&
              memberResults.length === 0 && (
                <section className="profile-status-card">
                  검색 결과가 없습니다.
                </section>
              )}

            {!memberLoading &&
              !memberError &&
              memberResults.length > 0 && (
                <section className="member-results">
                  {memberResults.map((member) => (
                    <div
                      className="member-result-card"
                      key={`${member.rank}-${member.lol_nickname}`}
                    >
                      <div className="member-result-main">
                        <div>
                          <span className="member-result-label">
                            LOL NICKNAME
                          </span>

                          <h3>{member.lol_nickname}<AliasNames aliases={member.aliases} /></h3>

                          <p>
                            {member.main_position}
                            {member.sub_position
                              ? ` / ${member.sub_position}`
                              : ''}
                          </p>
                        </div>

                        <div className="member-result-rating">
                          <span>종합 레이팅</span>
                          <strong>
                            {member.overall_rating}
                          </strong>
                        </div>
                      </div>

                      <div className="member-result-stats">
                        <div>
                          <span>주 포지션</span>
                          <strong>
                            {member.main_position}
                          </strong>
                        </div>

                        <div>
                          <span>전적</span>
                          <strong>
                            {member.wins}승 {member.losses}패
                          </strong>
                        </div>

                        <div>
                          <span>승률</span>
                          <strong>
                            {member.win_rate}%
                          </strong>
                        </div>
                      </div>
                      <MostChampions champions={member.most_champions} />
                    </div>
                  ))}
                </section>
              )}
          </main>
        </div>
      )
    }
  if (user) {
    if (page === 'admin' || page === 'member-sheet') {
      if (!['staff', 'superadmin'].includes(user.role)) return <div className="app"><main className="dashboard-page"><section className="record-panel"><p>관리자만 이용할 수 있습니다.</p><button className="logout-button" onClick={() => setPage('home')}>메인으로</button></section></main></div>
      return page === 'member-sheet'
        ? <MemberSheetPage onBack={openAdminPage} />
        : <AdminPage user={user} onBack={() => setPage('home')} onOpenSheet={() => setPage('member-sheet')} />
    }
    if (page === 'league-upload' || page === 'league-upload-form') return <LeagueUploadPage request={leagueRequest} onBack={openLeague} onCreated={openLeague} />
    if (page === 'league-apply') return <div className="app"><main className="dashboard-page"><header className="dashboard-header"><h1>리그 참가 신청</h1><button className="logout-button" onClick={()=>setPage('league')}>리그로 돌아가기</button></header><form className="login-form league-apply-form" onSubmit={submitLeagueApplication}><label>리그<select required value={leagueForm.league_id} onChange={e=>setLeagueForm({...leagueForm,league_id:e.target.value})}><option value="">리그 선택</option>{leagueData.filter(l=>l.status==='registration').map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select></label>{[['real_name','이름'],['lol_nickname','닉네임'],['tier','티어'],['internal_score','내전 점수']].map(([k,l])=><label key={k}>*{l}<input required value={leagueForm[k]} onChange={e=>setLeagueForm({...leagueForm,[k]:e.target.value})}/></label>)}<label>*주라인<select value={leagueForm.main_position} onChange={e=>setLeagueForm({...leagueForm,main_position:e.target.value})}>{['TOP','JUNGLE','MID','ADC','SUPPORT'].map(x=><option key={x}>{x}</option>)}</select></label><label>*부라인<select value={leagueForm.sub_position} onChange={e=>setLeagueForm({...leagueForm,sub_position:e.target.value})}>{['TOP','JUNGLE','MID','ADC','SUPPORT'].map(x=><option key={x}>{x}</option>)}</select></label><label>어필 한 마디<textarea value={leagueForm.appeal} onChange={e=>setLeagueForm({...leagueForm,appeal:e.target.value})}/></label>{leagueFormError&&<div className="login-error">{leagueFormError}</div>}{leagueFormMessage&&<div className="profile-status-card">{leagueFormMessage}</div>}<button className="login-button" disabled={leagueSubmitting || Boolean(leagueFormMessage)}>{leagueSubmitting ? '접수 중…' : leagueFormMessage ? '신청 완료' : '신청하기'}</button></form></main></div>

    if (page === 'league-applications') return <LeagueApplicationsPage key={applicationLeagueId} leagueId={applicationLeagueId} league={leagueData.find(l => l.id === applicationLeagueId)} request={leagueRequest} onBack={openLeague} />
    if (page === 'league') {
      const activeLeague = leagueData.find(l => l.status === 'registration' || l.status === 'ongoing')
      const closedLeagues = leagueData.filter(l => l.status === 'closed')
      const isAdmin = ['staff', 'superadmin'].includes(user.role)
      const applied = activeLeague && appliedLeagueIds.includes(Number(activeLeague.id))
      return <div className="app"><main className="dashboard-page league-workspace">
        <header className="dashboard-header"><div><p className="workspace-eyebrow">LOLEX LEAGUE</p><h1>리그</h1></div><button className="logout-button" onClick={() => setPage('home')}>메인으로</button></header>
        {leagueError && <div className="login-error" role="alert">{leagueError}</div>}
        {leagueLoading ? <section className="record-panel"><p role="status">리그 정보를 불러오는 중입니다.</p></section> : <div className="league-overview-grid">
          <section className="record-panel">
            {activeLeague ? <>
              {activeLeague.thumbnail_url && <img className="league-cover" src={activeLeague.thumbnail_url} alt={activeLeague.title} />}
              <span className="league-badge">{activeLeague.status === 'registration' ? '참가 신청 접수 중' : '진행 중'}</span><h2>{activeLeague.title}</h2><p>{activeLeague.description || '함께 도전할 리그에 참가해보세요.'}</p>
              <div className="league-actions">
                {activeLeague.status === 'registration' && <button className="login-button" disabled={applied} onClick={() => { setLeagueForm({ ...leagueForm, league_id: activeLeague.id }); setLeagueFormError(''); setLeagueFormMessage(''); setPage('league-apply') }}>{applied ? '신청 완료' : '참가 신청하기'}</button>}
                {isAdmin && <><button className="signup-button" onClick={() => openLeagueApplications(activeLeague.id)}>신청 현황</button><button className="queue-cancel-button" disabled={leagueSubmitting} onClick={() => manageLeague('PATCH', activeLeague.id)}>리그 종료</button></>}
              </div>
            </> : <div className="empty-state"><h2>새로운 리그를 기다리고 있어요</h2><p>현재 진행 중인 리그가 없습니다.</p>{isAdmin && <button className="login-button" onClick={() => setPage('league-upload-form')}>리그 업로드</button>}</div>}
          </section>
          <section className="record-panel"><h2>종료된 리그</h2>{closedLeagues.length ? <div className="league-closed-list">{closedLeagues.map(l => <article key={l.id}><h3>{l.title}</h3>{isAdmin && <div className="league-actions"><button className="queue-cancel-button" disabled={leagueSubmitting} onClick={() => manageLeague('DELETE', l.id)}>삭제</button></div>}</article>)}</div> : <p className="empty-state">종료된 리그가 없습니다.</p>}</section>
        </div>}
      </main></div>
    }
    if (page === 'league-old') {
  return (
    <div className="app">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <main className="dashboard-page">
        <header className="dashboard-header">
          <div className="brand dashboard-brand">
            <div className="brand-mark">L</div>

            <div>
              <h1>LOLEX</h1>
              <p>League of Legends Community</p>
            </div>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={() => setPage('home')}
          >
            ← 메인으로
          </button>
        </header>

        <section className="welcome-panel">
          <p className="welcome-label">
            LOLEX LEAGUE
          </p>

          <h2>리그 정보</h2>

          <p>
            LOLEX에서 진행되는 리그 정보를 확인합니다.
          </p>
        </section>
        {leagueLoading && (
  <section className="profile-status-card">
    리그 정보를 불러오는 중입니다...
  </section>
)}

{leagueError && (
  <section className="profile-status-card profile-error">
    {leagueError}
  </section>
)}

{!leagueLoading &&
  !leagueError &&
  leagueData.length === 0 && (
    <section className="profile-status-card">
      현재 등록된 리그가 없습니다.
    </section>
  )}

{!leagueLoading &&
  !leagueError &&
  leagueData.length > 0 && (
    <section className="league-list">
      {leagueData.map((league) => (
        <div
          className="league-card"
          key={league.id}
        >
          <div className="league-card-header">
            <div>
              <span className="profile-small-label">
                LOLEX LEAGUE
              </span>

              <h3>{league.title}</h3>
            </div>

            <strong>
              {league.status === 'registration'
                ? '참가 신청 중'
                : league.status === 'upcoming'
                ? '개최 예정'
                : league.status === 'ongoing'
                ? '진행 중'
                : '종료'}
            </strong>
          </div>

          {league.status !== 'finished' && (
  <>
    {league.description && (
      <p className="league-description">
        {league.description}
      </p>
    )}

    <div className="league-info-grid">
      <div>
        <span>최대 참가 인원</span>
        <strong>
          {league.max_participants
            ? `${league.max_participants}명`
            : '제한 없음'}
        </strong>
      </div>

      <div>
        <span>리그 시작</span>
        <strong>
          {league.league_start
            ? new Date(
                league.league_start
              ).toLocaleDateString('ko-KR')
            : '일정 미정'}
        </strong>
      </div>

      <div>
        <span>신청 마감</span>
        <strong>
          {league.registration_end
            ? new Date(
                league.registration_end
              ).toLocaleDateString('ko-KR')
            : '마감일 미정'}
        </strong>
      </div>
    </div>
  </>
)}
{league.status === 'registration' && <button type="button" className="login-button" onClick={() => { setLeagueForm({...leagueForm, league_id: league.id}); setPage('league-apply') }}>신청하기</button>}
        </div>
      ))}
    </section>
  )}
      </main>
    </div>
  )
}
     if (page === 'ranking') {
    if (page === 'history') {
      return (
        <div className="app">
          <main className="dashboard-page">
            <header className="dashboard-header"><div className="brand dashboard-brand"><div className="brand-mark">L</div><div><h1>LOLEX</h1><p>League of Legends Community</p></div></div><button type="button" className="logout-button" onClick={() => setPage('home')}>메인으로</button></header>
            <section className="record-panel match-history-panel"><div className="section-title"><p>MATCH HISTORY</p><h2>최근 경기</h2></div>{matchHistory.length === 0 ? <p className="empty-state">최근 경기가 없습니다.</p> : <div className="match-history-list">{matchHistory.map((match) => <article className="match-history-item" key={match.id}><strong>#{match.id} · {match.winner === 'BLUE' ? '블루팀 승리' : '레드팀 승리'}</strong><small>{new Date(match.finished_at || match.created_at).toLocaleString('ko-KR')}</small>{match.players.map((player) => <span key={player.id}>{player.lol_nickname || player.username} · {player.kills ?? '—'}/{player.deaths ?? '—'} · {player.champion || '챔피언 미입력'}</span>)}</article>)}</div>}</section>
          </main>
        </div>
      )
    }

    if (page === 'history') return <div className="app"><main className="dashboard-page"><header className="dashboard-header"><div className="brand dashboard-brand"><div className="brand-mark">L</div><div><h1>LOLEX</h1><p>League of Legends Community</p></div></div><button type="button" className="logout-button" onClick={() => setPage('home')}>메인으로</button></header><section className="record-panel match-history-panel"><div className="section-title"><p>MATCH HISTORY</p><h2>최근 경기</h2></div>{matchHistory.length === 0 ? <p className="empty-state">최근 경기가 없습니다.</p> : <div className="match-history-list">{matchHistory.map((match) => <article className="match-history-item" key={match.id}><strong>#{match.id}</strong></article>)}</div>}</section></main></div>

    return (
      <div className="app">
        <div className="background-glow glow-one"></div>
        <div className="background-glow glow-two"></div>

        <main className="dashboard-page">
          <header className="dashboard-header">
            <div className="brand dashboard-brand">
              <div className="brand-mark">L</div>

              <div>
                <h1>LOLEX</h1>
                <p>League of Legends Community</p>
              </div>
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={() => setPage('home')}
            >
              ← 메인으로
            </button>
          </header>

          <section className="welcome-panel">
            <p className="welcome-label">
              LOLEX RANKING
            </p>

            <h2>랭킹</h2>

            <p>
              LOLEX 회원들의 현재 레이팅 순위를 확인합니다.
            </p>
          </section>

          {rankingLoading && (
            <section className="profile-status-card">
              랭킹을 불러오는 중입니다...
            </section>
          )}

          {rankingError && (
            <section className="profile-status-card profile-error">
              {rankingError}
            </section>
          )}

          {!rankingLoading &&
            !rankingError &&
            rankingData.length === 0 && (
              <section className="profile-status-card">
                표시할 랭킹 정보가 없습니다.
              </section>
            )}

          {!rankingLoading &&
            !rankingError &&
            rankingData.length > 0 && (
              <section className="ranking-panel">
                <div className="ranking-header">
                  <span>순위</span>
                  <span>소환사</span>
                  <span>주 포지션</span>
                  <span>레이팅</span>
                  <span>전적</span>
                  <span>승률</span>
                </div>

                <div className="ranking-list">
                  {rankingData.map((member) => (
                    <div
                      className="ranking-item"
                      key={`${member.rank}-${member.lol_nickname}`}
                    >
                      <div className="ranking-rank">
                        {member.rank}
                      </div>

                      <div className="ranking-player">
                        <strong>
                          {member.lol_nickname}
                        </strong>

                        <small>
                          {member.main_position}
                          {member.sub_position
                            ? ` / ${member.sub_position}`
                            : ''}
                        </small>
                      </div>

                      <div className="ranking-position">
                        {member.main_position}
                      </div>

                      <div className="ranking-rating">
                        {member.overall_rating}
                      </div>

                      <div className="ranking-record">
                        {member.wins}승 {member.losses}패
                      </div>

                      <div className="ranking-winrate">
                        {member.win_rate}%
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
        </main>
      </div>
    )
  }
    if (page === 'profile') {
      return (
        <div className="app">
          <div className="background-glow glow-one"></div>
          <div className="background-glow glow-two"></div>

          <main className="dashboard-page">
            <header className="dashboard-header">
              <div className="brand dashboard-brand">
                <div className="brand-mark">L</div>

                <div>
                  <h1>LOLEX</h1>
                  <p>League of Legends Community</p>
                </div>
              </div>

              <button
                type="button"
                className="logout-button"
                onClick={() => setPage('home')}
              >
                ← 메인으로
              </button>
            </header>

            <section className="welcome-panel">
              <p className="welcome-label">
                MY PROFILE
              </p>

              <h2>내 정보</h2>

              <p>
                현재 LOLEX 레이팅과 전적을 확인합니다.
              </p>
            </section>

            {profileLoading && (
              <section className="profile-status-card">
                내 정보를 불러오는 중입니다...
              </section>
            )}

            {profileError && (
              <section className="profile-status-card profile-error">
                {profileError}
              </section>
            )}

            {!profileLoading &&
              !profileError &&
              profileData && (
                <>
                  <section className="profile-summary-card">
                    <div>
                      <p className="profile-small-label">
                        LOL NICKNAME
                      </p>

                      <h2>
                        {profileData.profile.lol_nickname}<AliasNames aliases={profileData.profile.aliases} />
                      </h2>

                      <p className="profile-username">
                        @{profileData.profile.username}
                      </p>
                      <ProfileAliases onAdded={aliases => setProfileData(current => ({ ...current, profile: { ...current.profile, aliases } }))} />
                    </div>

                    <div className="overall-rating">
                      <span>종합 레이팅</span>

                      <strong>
                        {profileData.rating.overall_rating}
                      </strong>
                    </div>
                  </section>

                  <MostChampions champions={profileData.most_champions} />
                  <section className="profile-info-grid">
                    <div className="profile-info-card">
                      <span>주 포지션</span>
                      <strong>
                        {profileData.profile.main_position}
                      </strong>
                    </div>

                    <div className="profile-info-card">
                      <span>부 포지션</span>
                      <strong>
                        {profileData.profile.sub_position ||
                          '-'}
                      </strong>
                    </div>

                    <div className="profile-info-card">
                      <span>게임 수</span>
                      <strong>
                        {profileData.rating.games_played}
                      </strong>
                    </div>

                    <div className="profile-info-card">
                      <span>승률</span>
                      <strong>
                        {profileData.rating.win_rate}%
                      </strong>
                    </div>
                  </section>

                  <section className="rating-panel">
                    <div className="section-title">
                      <p>POSITION RATING</p>
                      <h3>포지션별 레이팅</h3>
                    </div>

                    <div className="rating-list">
                      <div className="rating-row">
                        <span>TOP</span>
                        <strong>
                          {profileData.rating.top_rating}
                        </strong>
                      </div>

                      <div className="rating-row">
                        <span>JUNGLE</span>
                        <strong>
                          {profileData.rating.jungle_rating}
                        </strong>
                      </div>

                      <div className="rating-row">
                        <span>MID</span>
                        <strong>
                          {profileData.rating.mid_rating}
                        </strong>
                      </div>

                      <div className="rating-row">
                        <span>ADC</span>
                        <strong>
                          {profileData.rating.adc_rating}
                        </strong>
                      </div>

                      <div className="rating-row">
                        <span>SUPPORT</span>
                        <strong>
                          {profileData.rating.support_rating}
                        </strong>
                      </div>
                    </div>
                  </section>

                  <section className="record-panel">
                    <div className="section-title">
                      <p>MATCH RECORD</p>
                      <h3>전적</h3>
                    </div>

                    <div className="record-grid">
                      <div>
                        <span>전체</span>
                        <strong>
                          {profileData.rating.games_played}전
                        </strong>
                      </div>

                      <div>
                        <span>승리</span>
                        <strong>
                          {profileData.rating.wins}승
                        </strong>
                      </div>

                      <div>
                        <span>패배</span>
                        <strong>
                          {profileData.rating.losses}패
                        </strong>
                      </div>

                      <div>
                        <span>승률</span>
                        <strong>
                          {profileData.rating.win_rate}%
                        </strong>
                      </div>
                    </div>
                  </section>
                </>
              )}
          </main>
        </div>
      )
    }

    return (
      <div className="app">
        <div className="background-glow glow-one"></div>
        <div className="background-glow glow-two"></div>

        <main className="dashboard-page">
          <header className="dashboard-header">
            <div className="brand dashboard-brand">
              <div className="brand-mark">L</div>

              <div>
                <h1>LOLEX</h1>
                <p>League of Legends Community</p>
              </div>
            </div>

            <button
              type="button"
              className="logout-button"
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </header>

          <section className="welcome-panel">
            <p className="welcome-label">
              WELCOME TO LOLEX
            </p>

            <h2>
              {user.lol_nickname ||
                user.username ||
                '회원'}님, 반갑습니다.
            </h2>

            <p>
              LOLEX 매칭 시스템에 로그인되었습니다.
            </p>
          </section>

          <section className="dashboard-grid">
            {(user.role === 'staff' || user.role === 'superadmin') && <button type="button" className="dashboard-card" data-card="admin" onClick={openAdminPage}><strong>관리 페이지</strong><small>회원 승인 및 관리</small></button>}
            <button
              type="button"
              className="dashboard-card"
            data-card="queue"
            onClick={openQueue}
            >
              <span className="dashboard-card-icon">
                ⚔
              </span>

              <strong>매칭 신청</strong>

              <small>
                게임 매칭 대기열에 참가합니다.
              </small>
            </button>

            <button
              type="button"
              className="dashboard-card"
              data-card="profile"
              onClick={openMyProfile}
            >
              <span className="dashboard-card-icon">
                ◈
              </span>

              <strong>내 정보</strong>

              <small>
                레이팅과 전적을 확인합니다.
              </small>
            </button>

            <button
              type="button"
              className="dashboard-card"
              data-card="ranking"
              onClick={openRanking}
            >
              <span className="dashboard-card-icon">
                ♛
              </span>

              <strong>랭킹</strong>

              <small>
                LOLEX 회원 랭킹을 확인합니다.
              </small>
            </button>

            <button
              type="button"
              className="dashboard-card"
              data-card="members"
              onClick={openMemberSearch}
            >
              <span className="dashboard-card-icon">
                ⌕
              </span>

              <strong>회원 검색</strong>

              <small>
                닉네임으로 회원을 찾아봅니다.
              </small>
            </button>
            <button
  type="button"
  className="dashboard-card"
  data-card="league"
  onClick={openLeague}
>
  <span className="dashboard-card-icon">
    🏆
  </span>

  <strong>리그 정보</strong>

  <small>
    LOLEX 리그 정보와 참가 현황을 확인합니다.
  </small>
</button>
          </section>

          <button type="button" className="dashboard-card match-history-button" data-card="history" onClick={openMatchHistory}>
            <span className="dashboard-card-icon">◷</span><strong>최근 경기</strong><small>완료된 매칭 기록과 참가자를 확인합니다.</small>
          </button>
        </main>
      </div>
    )
  }

  if (page === 'history') {
    return (<div className="app"><main className="dashboard-page"><header className="dashboard-header"><div className="brand dashboard-brand"><div className="brand-mark">L</div><div><h1>LOLEX</h1><p>League of Legends Community</p></div></div><button type="button" className="logout-button" onClick={()=>setPage('home')}>메인으로</button></header><section className="record-panel match-history-panel"><div className="section-title"><p>MATCH HISTORY</p><h2>최근 경기</h2></div>{matchHistory.length === 0 ? <p className="empty-state">최근 경기가 없습니다.</p> : <div className="match-history-list">{matchHistory.map((match) => <article className="match-history-item" key={match.id}><div><strong>#{match.id} · {match.winner === 'BLUE' ? '블루팀 승리' : '레드팀 승리'}</strong><small>{new Date(match.finished_at || match.created_at).toLocaleString('ko-KR')}</small></div><div className="match-history-players">{match.players.map((player) => <span key={player.id} className={player.team === match.winner ? 'win' : 'loss'}>{player.lol_nickname || player.username} · {player.kills ?? '—'}/{player.deaths ?? '—'} · {player.champion || '챔피언 미입력'}</span>)}</div></article>)}</div>}</section></main></div>)
  }

  if (page === 'signup') {
    return (<div className="app"><main className="login-page"><section className="login-card"><div className="brand"><div className="brand-mark">L</div><div><h1>LOLEX</h1><p>League of Legends Community</p></div></div><div className="login-title"><h2>회원가입</h2><p>닉네임은 닉네임#해시태그 형식으로 입력해주세요. 대소문자는 구분하지 않습니다.</p></div><form className="login-form" onSubmit={handleSignup}>{[['username','아이디','text'],['password','비밀번호','password'],['real_name','성명','text'],['birth_date','생년월일','date'],['lol_nickname','LoL 닉네임#해시태그','text']].map(([key,label,type]) => <label key={key}>{label}<input required type={type} value={signup[key]} onChange={(e)=>setSignup({...signup,[key]:e.target.value})} /></label>)}<label>내전 점수 (기존 멤버만 해당)<input type="number" min="0" max="50" step="1" placeholder="내전 점수를 입력해주세요. (기존 멤버만 해당 됩니다.)" value={signup.initial_internal_score} onChange={e => setSignup({ ...signup, initial_internal_score: e.target.value })} /><small>미입력·0점 1000 · 1~15점 1200 · 16~25점 1500 · 26~35점 1800 · 36점 이상 2000</small><small>시작 레이팅: {signup.initial_internal_score === '' ? 1000 : initialRatingFromScore(signup.initial_internal_score) ?? '점수를 확인해주세요'}</small></label><label>주 포지션<select value={signup.main_position} onChange={(e)=>setSignup({...signup,main_position:e.target.value})}>{['TOP','JUNGLE','MID','ADC','SUPPORT'].map((p)=><option key={p}>{p}</option>)}</select></label><label>부 포지션<select value={signup.sub_position} onChange={(e)=>setSignup({...signup,sub_position:e.target.value})}><option value="">없음</option>{['TOP','JUNGLE','MID','ADC','SUPPORT'].map((p)=><option key={p}>{p}</option>)}</select></label>{signupError && <div className="login-error">{signupError}</div>}<button className="login-button" disabled={signupLoading}>{signupLoading ? '가입 처리 중...' : '회원가입'}</button></form><div className="login-footer"><button type="button" className="signup-button" onClick={()=>setPage('login')}>로그인으로 돌아가기</button></div></section></main></div>)
  }

  return (
    <div className="app">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <main className="login-page">
        <section className="login-card">
          <div className="brand">
            <div className="brand-mark">L</div>

            <div>
              <h1>LOLEX</h1>
              <p>League of Legends Community</p>
            </div>
          </div>

          <div className="login-title">
            <h2>다시 만나서 반가워요</h2>

            <p>
              LOLEX에 로그인하고 매칭을 시작하세요.
            </p>
          </div>

          <form
            className="login-form"
            onSubmit={handleSubmit}
          >
            <label>
              아이디

              <input
                type="text"
                placeholder="아이디를 입력하세요"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value)
                }
                autoComplete="username"
                disabled={loading}
              />
            </label>

            <label>
              비밀번호

              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                autoComplete="current-password"
                disabled={loading}
              />
            </label>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading
                ? '로그인 중...'
                : '로그인'}
            </button>
          </form>

          <div className="login-footer">
            <span>
              아직 회원이 아니신가요?
            </span>

            <button
              type="button"
              className="signup-button"
              onClick={() => { setSignupError(''); setPage('signup') }}
            >
              회원가입
            </button>
          </div>
        </section>

        <p className="copyright">
          © 2026 LOLEX. All rights reserved.
        </p>
      </main>
    </div>
  )
}

export default App
