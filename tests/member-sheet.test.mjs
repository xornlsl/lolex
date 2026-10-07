import test from 'node:test'
import assert from 'node:assert/strict'
import { canManageSheet, validateSheetEntry, parseInitialScore, validateRiotId } from '../supabase/functions/_shared/member-sheet-validation.js'
import { initialRatingFromScore } from '../src/lib/rating.js'

const entry = { real_name: '홍길동', birth_date: '2000-02-29', lol_nickname: '야 호#메아리' }
test('validates leap days and preserves spaces inside Riot IDs', () => {
  assert.deepEqual(validateSheetEntry({ ...entry, real_name: ' 홍길동 ', lol_nickname: ' 야 호#메아리 ' }), entry)
  for (const birth_date of ['2001-02-29', '2000-04-31', 'tomorrow', '2999-01-01']) {
    assert.throws(() => validateSheetEntry({ ...entry, birth_date }))
  }
})
test('requires both Riot ID parts and rejects malformed values', () => {
  for (const lol_nickname of ['', '별명', '#KR1', '별명#', '별명#   ', '별명#아\t빠', '별명#아\n빠', '별명#KR1#more', 123]) {
    assert.throws(() => validateSheetEntry({ ...entry, lol_nickname }))
  }
  assert.throws(() => validateSheetEntry({ ...entry, real_name: ' ' }))
  assert.throws(() => validateSheetEntry(null))
})
test('only approved STAFF and SUPERADMIN can access the roster', () => {
  for (const role of ['member', 'staff', 'superadmin']) {
    for (const status of ['pending', 'suspended', 'approved']) {
      assert.equal(canManageSheet({ role, status }), status === 'approved' && role !== 'member')
    }
  }
  assert.equal(canManageSheet(null), false)
})

test('initial rating accepts only blank or integer scores 0 through 50', () => {
  for (const value of ['', undefined, null, 0, '0']) assert.equal(parseInitialScore(value), 0)
  assert.equal(initialRatingFromScore(parseInitialScore('32')), 1800)
  assert.equal(initialRatingFromScore(parseInitialScore(50)), 2000)
  for (const value of [-1, '-1', 51, '51', 1.5, '1.5', true, [], {}, '1e1', ' ']) {
    assert.throws(() => parseInitialScore(value))
  }
})
test('aliases use the same Riot ID format and retain display spelling', () => {
  assert.equal(validateRiotId(' 택사마택#kr1 '), '택사마택#kr1')
  for (const value of ['닉네임', '#KR1', '이름#   ', '이름#아\t빠', '이름#아\n빠', 'a#b#c', null]) assert.throws(() => validateRiotId(value))
})

test('sheet registration and signup preserve spaces inside hashtags', () => {
  for (const lol_nickname of ['힝 구#아 빠', '이름#KR 1', '힝 구#아  빠']) {
    assert.equal(validateSheetEntry({ ...entry, lol_nickname }).lol_nickname, lol_nickname)
    assert.equal(validateRiotId(` ${lol_nickname} `), lol_nickname)
  }
})
