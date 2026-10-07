import test from 'node:test'
import assert from 'node:assert/strict'
import { initialRatingFromScore } from './rating.js'

test('maps internal scores to the new starting rating tiers', () => {
  for (const [score, rating] of [[0,1000],[1,1200],[15,1200],[16,1500],[25,1500],[26,1800],[35,1800],[36,2000],[50,2000]]) {
    assert.equal(initialRatingFromScore(score), rating)
    assert.equal(initialRatingFromScore(String(score)), rating)
  }
})

test('rejects values outside the accepted score range', () => {
  for (const value of [-1, 51, 1.5, '1.5', '', null, undefined, true]) {
    assert.equal(initialRatingFromScore(value), null)
  }
})

test('preserving the old delta carries a 20 point win into the new tier', () => {
  const score = 20
  const oldBase = 1000 + score * 10
  const currentAfterWin = oldBase + 20
  const migrated = initialRatingFromScore(score) + (currentAfterWin - oldBase)
  assert.equal(migrated, 1520)
})
