import { useState } from 'react'
import { apiRequest } from '../lib/api'

export function AliasNames({ aliases = [] }) {
  if (!aliases.length) return null
  return <small className="profile-alias-names">({aliases.map(alias => alias.lol_nickname).join(' / ')})</small>
}

export default function ProfileAliases({ onAdded }) {
  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function add(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const data = await apiRequest('lolex-aliases', { method: 'POST', body: { lol_nickname: nickname } })
      onAdded(data.aliases)
      setNickname(''); setOpen(false); setMessage('부계정을 추가했습니다.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <div className="profile-alias-editor">
    <button className="signup-button" type="button" aria-expanded={open} onClick={() => { setOpen(!open); setError(''); setMessage('') }}>부계정 추가하기</button>
    {open && <form className="login-form" onSubmit={add}>
      <label>부계정 닉네임#해시태그<input required maxLength={100} placeholder="택사마택#kr1" value={nickname} onChange={e => setNickname(e.target.value)} /></label>
      <button className="login-button" disabled={busy} type="submit">{busy ? '추가 중...' : '추가'}</button>
    </form>}
    {error && <p className="login-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </div>
}
