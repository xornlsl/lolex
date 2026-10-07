export function initialRatingFromScore(score) {
  if (typeof score !== 'number' && typeof score !== 'string') return null
  if (typeof score === 'string' && !/^(?:0|[1-9]\d?)$/.test(score)) return null
  const value = Number(score)
  if (!Number.isInteger(value) || value < 0 || value > 50) return null
  if (value === 0) return 1000
  if (value <= 15) return 1200
  if (value <= 25) return 1500
  if (value <= 35) return 1800
  return 2000
}
