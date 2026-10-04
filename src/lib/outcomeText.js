export function parseOutcomeText(text) {
  const normalized = text.normalize('NFKC').replace(/\s/g, '')
  if (normalized === '승리') return 'victory'
  if (normalized === '패배') return 'defeat'
  return null
}

export function agreedOutcome(readings) {
  const valid = readings.filter(reading => reading.confidence >= 60)
    .map(reading => parseOutcomeText(reading.text)).filter(Boolean)
  return valid.length >= 2 && new Set(valid).size === 1 ? valid[0] : null
}
