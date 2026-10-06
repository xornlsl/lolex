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
    if (action === 'kick' && !window.confirm(member.status === 'pending'
      ? `${member.real_name} (${member.username}) 님의 가입 신청을 거절하시겠습니까?`
      : `${member.real_name} (${member.username}) 님을 강퇴하시겠습니까?\n과거 경기 기록은 보존되고 계정 이용이 차단됩니다.`)) return
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
  const roleLabels = { superadmin: '최고 관리자', staff: '운영진', member: '일반 회원' }
  const renderMember = member => <article className="admin-member-card" key={member.user_id}>
    <div className="admin-member-identity">
      <span className="admin-member-avatar" aria-hidden="true">{member.real_name?.slice(0, 1) || 'L'}</span>
      <div className="admin-member-name"><strong>{member.real_name}</strong>
        <div className="admin-member-badges"><span className={`admin-role admin-role-${member.role}`}>{roleLabels[member.role] || member.role}</span>{member.user_id === selfId && <span className="admin-self">나</span>}</div>
      </div>
    </div>
    <dl className="admin-member-details">
      <div className="admin-member-riot"><dt>롤 닉네임</dt><dd>{member.lol_nickname || '—'}</dd></div>
      <div><dt>회원 아이디</dt><dd>{member.username}</dd></div>
      <div><dt>생년월일</dt><dd>{member.birth_date || '—'}</dd></div>
    </dl>
    <div className="sheet-actions admin-member-actions">
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
    <section className="record-panel admin-members-panel"><div className="admin-section-heading"><h2>회원 승인</h2><span className="admin-member-count">{members.filter(m => m.status === 'pending').length}명 대기</span></div><div className="admin-member-list">{ordered.filter(m => m.status === 'pending').map(renderMember)}</div>{!loading && !error && !members.some(m => m.status === 'pending') && <p className="admin-members-empty">승인 대기 중인 회원이 없습니다.</p>}</section>
    <section className="record-panel admin-members-panel"><div className="admin-section-heading"><h2>회원 관리</h2><span className="admin-member-count">총 {members.filter(m => m.status === 'approved').length}명</span></div><div className="admin-member-list">{ordered.filter(m => m.status === 'approved').map(renderMember)}</div>{!loading && !error && !members.some(m => m.status === 'approved') && <p className="admin-members-empty">등록된 회원이 없습니다.</p>}</section>
  </main></div>
}
