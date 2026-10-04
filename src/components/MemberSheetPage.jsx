import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

const blankEntry = { real_name: '', birth_date: '', lol_nickname: '' }
const pageSize = 50

export default function MemberSheetPage({ onBack }) {
  const [members, setMembers] = useState([])
  const [total, setTotal] = useState(null)
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState(blankEntry)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    apiRequest(`lolex-member-sheet?offset=${page * pageSize}`, { signal: controller.signal })
      .then(data => { setMembers(data.members); setTotal(data.total) })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, revision])

  async function saveEntry(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('lolex-member-sheet', {
        method: editingId ? 'PATCH' : 'POST',
        body: { ...form, ...(editingId ? { id: editingId } : {}) },
      })
      setMessage(editingId ? '명단 정보를 수정했습니다.' : '모임원을 명단에 등록했습니다.')
      setForm(blankEntry)
      setEditingId(null)
      setLoading(true)
      setRevision(value => value + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(member) {
    if (saving || !window.confirm(`${member.real_name} 님을 시트 명단에서 삭제하시겠습니까?\n이미 가입한 계정은 삭제되지 않습니다.`)) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('lolex-member-sheet', { method: 'DELETE', body: { id: member.id } })
      if (editingId === member.id) { setEditingId(null); setForm(blankEntry) }
      setMessage('명단에서 삭제했습니다.')
      setLoading(true)
      if (members.length === 1 && page > 0) setPage(value => value - 1)
      else setRevision(value => value + 1)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return <div className="app"><main className="dashboard-page member-sheet-page">
    <header className="dashboard-header">
      <div><p className="welcome-label">MEMBER SHEET</p><h1>시트 명단</h1></div>
      <button className="logout-button" type="button" onClick={onBack}>관리 페이지로</button>
    </header>
    <section className="record-panel sheet-summary">
      <div><h2>모임원 명단</h2><p>회원가입 정보 대조에 사용할 성명, 생년월일, 롤 닉네임과 해시태그를 관리합니다.</p></div>
      <div className="sheet-total"><span>총 회원 수</span><strong>{total === null ? '—' : total.toLocaleString()}<small>명</small></strong></div>
    </section>
    <section className="record-panel">
      <h2>{editingId ? '모임원 정보 수정' : '모임원 등록'}</h2>
      <form className="login-form sheet-form" onSubmit={saveEntry}>
        <label>성명<input required maxLength={80} autoComplete="off" value={form.real_name} onChange={e => setForm({ ...form, real_name: e.target.value })} /></label>
        <label>생년월일<input required type="date" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} /></label>
        <label>롤 닉네임#해시태그<input required maxLength={100} placeholder="야 호#메아리" autoComplete="off" value={form.lol_nickname} onChange={e => setForm({ ...form, lol_nickname: e.target.value })} /></label>
        <div className="sheet-actions">
          <button type="submit" className="login-button" disabled={saving}>{saving ? '저장 중...' : editingId ? '수정 저장' : '명단 등록'}</button>
          {editingId && <button type="button" className="signup-button" disabled={saving} onClick={() => { setEditingId(null); setForm(blankEntry); setMessage('') }}>취소</button>}
        </div>
      </form>
    </section>
    {error && <div role="alert" className="login-error">{error}<button type="button" className="signup-button" onClick={() => { setLoading(true); setError(''); setRevision(value => value + 1) }}>다시 불러오기</button></div>}
    {message && <p role="status" className="profile-status-card">{message}</p>}
    <section className="record-panel">
      {loading ? <p role="status">명단을 불러오는 중입니다...</p> : !error && members.length === 0 ? <p className="empty-state">등록된 모임원이 없습니다.</p> : <>
        <div className="sheet-table-scroll"><table className="sheet-table">
          <caption className="sr-only">모임원 성명, 생년월일, 롤 닉네임과 해시태그 명단</caption>
          <thead><tr><th scope="col">번호</th><th scope="col">성명</th><th scope="col">생년월일</th><th scope="col">롤 닉네임#해시태그</th><th scope="col">관리</th></tr></thead>
          <tbody>{members.map((member, index) => <tr key={member.id}>
            <td>{page * pageSize + index + 1}</td><th scope="row">{member.real_name}</th><td>{member.birth_date}</td><td>{member.lol_nickname}</td>
            <td><button type="button" className="signup-button" disabled={saving} onClick={() => {
              setEditingId(member.id); setForm({ real_name: member.real_name, birth_date: member.birth_date, lol_nickname: member.lol_nickname }); setMessage(''); window.scrollTo({ top: 0, behavior: 'smooth' })
            }}>정보 변경</button><button type="button" className="queue-cancel-button sheet-delete" disabled={saving} onClick={() => deleteEntry(member)}>삭제</button></td>
          </tr>)}</tbody>
        </table></div>
        {total > pageSize && <nav className="sheet-actions sheet-pagination" aria-label="명단 페이지">
          <button type="button" className="signup-button" disabled={page === 0} onClick={() => { setLoading(true); setError(''); setPage(value => value - 1) }}>이전</button>
          <span>{page + 1} / {Math.ceil(total / pageSize)}</span>
          <button type="button" className="signup-button" disabled={(page + 1) * pageSize >= total} onClick={() => { setLoading(true); setError(''); setPage(value => value + 1) }}>다음</button>
        </nav>}
      </>}
    </section>
  </main></div>
}
