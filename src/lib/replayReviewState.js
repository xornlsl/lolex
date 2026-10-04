export function editReplayGame(games, index, patch) {
  return games.map((game, i) => i === index
    ? { ...game, ...patch, reviewed: false }
    : game)
}

// Only call after the selected game's fields have passed validation.
export function completeReplayReview(games, index) {
  return games.map((game, i) => i === index
    ? { ...game, reviewed: true }
    : game)
}

export function allReplayGamesReviewed(games) {
  return [2, 3].includes(games.length) && games.every(game => game.reviewed === true)
}
