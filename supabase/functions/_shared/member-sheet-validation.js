export function validateSheetEntry(body, today = new Date().toISOString().slice(0, 10)) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('입력 내용을 확인해주세요.')
  const real_name = typeof body.real_name === 'string' ? body.real_name.trim() : ''
  const birth_date = typeof body.birth_date === 'string' ? body.birth_date : ''
  const lol_nickname = typeof body.lol_nickname === 'string' ? body.lol_nickname.trim() : ''
  if (!real_name || real_name.length > 80) throw new Error('성명을 1~80자로 입력해주세요.')
  const date = new Date(`${birth_date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birth_date || birth_date > today) {
    throw new Error('올바른 생년월일을 입력해주세요.')
  }
  if (lol_nickname.length > 100 || !/^[^#\r\n]+#[^#\s]+$/.test(lol_nickname) || !lol_nickname.split('#')[0].trim()) {
    throw new Error('롤 닉네임을 닉네임#해시태그 형식으로 입력해주세요.')
  }
  return { real_name, birth_date, lol_nickname }
}

export function canManageSheet(profile) {
  return profile?.status === 'approved' && ['staff', 'superadmin'].includes(profile.role)
}

export function validateRiotId(value) {
  const riotId = typeof value === 'string' ? value.trim() : ''
  if (riotId.length > 100 || !/^[^#\r\n]+#[^#\s]+$/.test(riotId) || !riotId.split('#')[0].trim()) {
    throw new Error('롤 닉네임을 닉네임#해시태그 형식으로 입력해주세요.')
  }
  return riotId
}

export function parseInitialScore(value) {
  if (value === undefined || value === null || value === '') return 0
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^(?:0|[1-9]\d?)$/.test(String(value))) {
    throw new Error('내전 점수는 0~50 사이의 정수로 입력해주세요.')
  }
  const score = Number(value)
  if (score > 50) throw new Error('내전 점수는 0~50 사이의 정수로 입력해주세요.')
  return score
}
