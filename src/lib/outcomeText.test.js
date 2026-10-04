import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOutcomeText, agreedOutcome } from './outcomeText.js'

test('recognize split Korean heading without inferring misspelled words', () => {
  assert.equal(parseOutcomeText('승 리\n'), 'victory')
  assert.equal(parseOutcomeText('패\n배'), 'defeat')
  for (const text of ['승리 패배', '승리 소환사의 협곡', '승', '승리팀', '펫배', '']) {
    assert.equal(parseOutcomeText(text), null)
  }
})
test('require repeated confident and nonconflicting heading readings', () => {
  const r = (text, confidence = 90) => ({ text, confidence })
  assert.equal(agreedOutcome([r('승리'), r('승 리')]), 'victory')
  assert.equal(agreedOutcome([r('패배'), r('패 배')]), 'defeat')
  assert.equal(agreedOutcome([r('승리'), r('패배')]), null)
  assert.equal(agreedOutcome([r('승리'), r('승리', 20)]), null)
  assert.equal(agreedOutcome([]), null)
})
