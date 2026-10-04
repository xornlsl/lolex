import test from 'node:test'
import assert from 'node:assert/strict'
import { editReplayGame, completeReplayReview, allReplayGamesReviewed } from './replayReviewState.js'

for (const count of [2, 3]) {
  test(`${count} sets: final confirmation enabled only after every review`, () => {
    let games = Array.from({ length: count }, (_, i) => ({ filename: `${i}.rofl`, reviewed: false }))
    const original = games
    for (let i = 0; i < count; i++) {
      assert.equal(allReplayGamesReviewed(games), false)
      games = completeReplayReview(games, i)
      assert.equal(games[i].reviewed, true)
    }
    assert.equal(allReplayGamesReviewed(games), true)
    assert.ok(original.every(g => !g.reviewed))
    games = editReplayGame(games, 0, { winner: 'RED' })
    assert.equal(allReplayGamesReviewed(games), false)
    assert.ok(games.slice(1).every(g => g.reviewed))
    games = completeReplayReview(games, 0)
    assert.equal(allReplayGamesReviewed(games), true)
  })
}
test('empty and partial uploads cannot be confirmed', () => {
  assert.equal(allReplayGamesReviewed([]), false)
  assert.equal(allReplayGamesReviewed([{ reviewed: true }]), false)
})
