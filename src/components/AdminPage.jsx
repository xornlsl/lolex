import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

export default function AdminPage({ user, onBack, onOpenSheet }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const selfId = user.id || user.user_id

  useEffect(() => {
    const controller = new AbortController()
    apiRequest('lolex-admin-management', { signal: controller.signal })
      .then(data => setMembers(data.members || []))
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])

  async function act(member, action) {
    if (busy) return
    if (action === 'kick' && !window.confirm(`${member.real_name} (${member.username}) 님을 ${member.status === 'pending' ? '가입 거절' : '강퇴'}하시겠습니까?`)) return
    setBusy(true)
    setError('')
    try {
      await apiRequest('lolex-admin-management', { method: 'PATCH', body: { user_id: member.user_id, action } })
      setLoading(true)
      setRevision(value => value + 1)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const canRemove = member => member.user_id !== selfId && (user.role === 'superadmin' || member.role === 'member')
  const ordered = [...members].sort((a, b) => Number(b.user_id === selfId) - Number(a.user_id === selfId))
  const renderMember = member => <article className="match-history-item admin-member-row" key={member.user_id}>
    <div><strong>{member.real_name} {member.user_id === selfId && <small>(나)</small>}</strong>
      <p>회원 아이디: {member.username} · {member.role.toUpperCase()}</p>
      <p>{member.birth_date} · {member.lol_nickname}</p>
    </div>
    <div className="sheet-actions">
      {member.status === 'pending' && (user.role === 'superadmin' || member.role === 'member') && <button type="button" className="login-button" disabled={busy || loading} onClick={() => act(member, 'approve')}>승인</button>}
      {canRemove(member) && <button type="button" className="queue-cancel-button" disabled={busy || loading} onClick={() => act(member, 'kick')}>{member.status === 'pending' ? '거절' : '강퇴'}</button>}
      {member.status === 'approved' && user.role === 'superadmin' && member.role === 'member' && <button type="button" className="login-button" disabled={busy || loading} onClick={() => act(member, 'promote')}>STAFF 승격</button>}
    </div>
  </article>

  return <div className="app"><main className="dashboard-page admin-page">
    <header className="dashboard-header"><h1>관리 페이지</h1><button type="button" className="logout-button" onClick={onBack}>메인으로</button></header>
    <section className="record-panel sheet-summary"><div><h2>시트 명단</h2><p>모임원 정보를 등록하고 전체 명단을 확인합니다.</p></div><button className="login-button" type="button" onClick={onOpenSheet}>시트 명단 열기</button></section>
    {error && <p className="login-error" role="alert">{error}<button className="signup-button" type="button" onClick={() => { setLoading(true); setError(''); setRevision(value => value + 1) }}>다시 불러오기</button></p>}
    {loading && <p className="profile-status-card" role="status">회원 정보를 불러오는 중입니다...</p>}
    <section className="record-panel"><h2>회원 승인</h2>{ordered.filter(m => m.status === 'pending').map(renderMember)}{!loading && !error && !members.some(m => m.status === 'pending') && <p>승인 대기 중인 회원이 없습니다.</p>}</section>
    <section className="record-panel"><h2>회원 관리</h2>{ordered.filter(m => m.status === 'approved').map(renderMember)}</section>
  </main></div>
}
