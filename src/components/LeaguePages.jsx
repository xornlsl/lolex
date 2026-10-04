import { useEffect, useState } from 'react'

const positions = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT']

function PageFrame({ title, label, onBack, children }) {
  return <div className="app"><main className="dashboard-page league-workspace">
    <header className="dashboard-header"><div><p className="workspace-eyebrow">{label}</p><h1>{title}</h1></div><button className="logout-button" onClick={onBack}>리그로 돌아가기</button></header>
    {children}
  </main></div>
}

export function LeagueUploadPage({ request, onBack, onCreated }) {
  const [title, setTitle] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const selectFile = event => {
    const file = event.target.files?.[0]
    setThumbnail(''); setFileName(''); setError('')
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('5MB 이하의 JPG, PNG, WEBP 이미지를 선택해주세요.'); event.target.value = ''; return
    }
    setReading(true)
    const reader = new FileReader()
    reader.onload = () => { setThumbnail(String(reader.result)); setFileName(file.name); setReading(false) }
    reader.onerror = () => { setError('이미지를 읽지 못했습니다. 다시 선택해주세요.'); setReading(false) }
    reader.readAsDataURL(file)
  }
  const submit = async event => {
    event.preventDefault()
    if (busy || reading || !title.trim() || !thumbnail) return
    setBusy(true); setError('')
    try { await request('lolex-league-admin', 'POST', { title: title.trim(), thumbnail_data: thumbnail }); onCreated() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <PageFrame title="리그 업로드" label="LOLEX · NEW LEAGUE" onBack={onBack}>
    <form className="record-panel league-upload-grid" onSubmit={submit}>
      <div className="league-upload-fields"><div><h2>새로운 리그를 열어보세요</h2><p>제목과 대표 이미지를 등록하면 참가 신청이 시작됩니다.</p></div>
        <label className="league-field">리그 제목<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} placeholder="예: LOLEX 가을 리그" disabled={busy} /></label>
        <label className="league-file-picker"><strong>대표 이미지 선택</strong><span>JPG · PNG · WEBP / 최대 5MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} disabled={busy || reading} /></label>
        {fileName && <p className="league-file-name">{fileName}</p>}
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="login-button" disabled={busy || reading || !title.trim() || !thumbnail}>{busy ? '등록 중…' : reading ? '이미지 읽는 중…' : '신청 접수 시작'}</button>
      </div>
      <aside className="league-upload-preview"><p className="workspace-eyebrow">미리보기</p><div className="league-preview-image">{thumbnail ? <img src={thumbnail} alt="리그 대표 이미지 미리보기" /> : <div><strong>LOLEX LEAGUE</strong><span>대표 이미지가 여기에 표시됩니다.</span></div>}</div><span className="league-badge">참가 신청 접수 중</span><h3>{title.trim() || '리그 제목'}</h3><p>등록 전 제목과 이미지가 잘 보이는지 확인해주세요.</p></aside>
    </form>
  </PageFrame>
}

export function LeagueApplicationsPage({ league, leagueId, request, onBack }) {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(null)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let cancelled = false
    request(`lolex-league-register?league_id=${encodeURIComponent(leagueId)}`).then(data => {
      if (!cancelled) setApplications(data.applications || [])
    }).catch(err => { if (!cancelled) setError(err.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leagueId, refresh, request])
  const remove = async application => {
    if (!window.confirm(`${application.lol_nickname}님의 리그 신청을 삭제할까요?`)) return
    setRemoving(application.id); setError('')
    try {
      await request('lolex-league-register', 'DELETE', { registration_id: application.id })
      setApplications(items => items.filter(item => item.id !== application.id))
    } catch (err) { setError(err.message) }
    finally { setRemoving(null) }
  }
  const visible = applications.filter(a => (!position || a.main_position === position) && `${a.real_name} ${a.lol_nickname}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <PageFrame title="신청 현황" label="LOLEX · APPLICATIONS" onBack={onBack}>
    <section className="record-panel league-applications-summary"><div><span className="league-badge">{league?.status === 'closed' ? '접수 종료' : '참가 신청'}</span><h2>{league?.title || '리그 참가 신청'}</h2><p>신청 정보와 어필 한 마디를 함께 확인하세요.</p></div><div className="league-applicant-count"><span>총 신청 인원</span><strong>{loading ? '…' : applications.length}<small>명</small></strong></div></section>
    <section className="record-panel league-applications-panel">
      <div className="league-filter-bar"><label className="league-field">이름 · 닉네임 검색<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="신청자 찾기" /></label><label className="league-field">주 포지션<select value={position} onChange={e => setPosition(e.target.value)}><option value="">전체 포지션</option>{positions.map(p => <option key={p}>{p}</option>)}</select></label><button type="button" className="signup-button" disabled={loading} onClick={() => { setLoading(true); setError(''); setRefresh(n => n + 1) }}>새로고침</button></div>
      {error && <div className="login-error" role="alert">{error}</div>}
      {loading ? <p className="empty-state" role="status">신청 정보를 불러오는 중입니다.</p> : <><p className="league-result-count">전체 {applications.length}명 중 {visible.length}명 표시</p>
        {visible.length === 0 ? <p className="empty-state">{applications.length ? '검색 조건에 맞는 신청자가 없습니다.' : '아직 접수된 신청이 없습니다.'}</p> : <div className="league-application-grid">{visible.map(a => <article className="league-application-card" key={a.id}>
          <header><div><h3>{a.lol_nickname}</h3><p>{a.real_name}</p></div><span className="league-badge">{a.main_position === 'SUPPORT' ? 'SUP' : a.main_position}</span></header>
          <dl className="league-application-facts"><div><dt>티어</dt><dd>{a.tier || '—'}</dd></div><div><dt>내전 점수</dt><dd>{a.internal_score ?? '—'}점</dd></div><div><dt>주 / 부 포지션</dt><dd>{a.main_position} / {a.sub_position}</dd></div></dl>
          <div className="league-appeal"><h4>어필 한 마디</h4><p>{a.appeal?.trim() ? a.appeal : '작성한 어필이 없습니다.'}</p></div>
          <footer><small>{a.created_at ? new Date(a.created_at).toLocaleString('ko-KR') : ''}</small><button type="button" className="queue-cancel-button" disabled={removing !== null} onClick={() => remove(a)}>{removing === a.id ? '삭제 중…' : '신청 삭제'}</button></footer>
        </article>)}</div>}</>}
    </section>
  </PageFrame>
}
