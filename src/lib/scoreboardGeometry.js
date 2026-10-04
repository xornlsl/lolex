// Identify text bands from pixels, not from the screenshot's overall height.
export function findTextBands(image, x, width) {
  const bands = []
  let start = null
  let last = -1
  const minimum = Math.max(5, width * .045)
  for (let y = 0; y < image.height; y++) {
    let count = 0
    for (let px = x; px < Math.min(image.width, x + width); px++) {
      const i = (y * image.width + px) * 4
      const [r, g, b] = image.data.subarray(i, i + 3)
      // Neutral scoreboard text and yellow highlighted text. Exclude team
      // totals (cyan/red), item art, and the dark background.
      if (r > 110 && g > 100 && (Math.abs(r - g) < 65) && (b > 90 || r > 165 && g > 135)) count++
    }
    if (count >= minimum) {
      if (start === null) start = y
      last = y
    } else if (start !== null && y - last > 2) {
      if (last - start >= 5) bands.push({ top: start, bottom: last, rowY: (start + last) / 2 })
      start = null
    }
  }
  if (start !== null && last - start >= 5) bands.push({ top: start, bottom: last, rowY: (start + last) / 2 })
  return bands
}

export function isScoreboardLayout(rows) {
  if (rows.length !== 10) return false
  const gaps = rows.slice(1).map((row, i) => row.rowY - rows[i].rowY)
  const normal = gaps.filter((_, i) => i !== 4).sort((a, b) => a - b)
  const median = (normal[3] + normal[4]) / 2
  return median > 10 && normal.every(gap => gap > median * .65 && gap < median * 1.35) &&
    gaps[4] > median * 1.05 && gaps[4] < median * 3.5
}

export function parseKdaRow(text) {
  // Require exactly one complete triple. Never take the first ten matches or
  // substitute numbers for letters: ambiguous OCR must be retried.
  const match = text.trim().match(/^(\d{1,3})\s*\/\s*(\d{1,3})\s*\/\s*(\d{1,3})$/)
  return match ? { kills: +match[1], deaths: +match[2], assists: +match[3] } : null
}

export function agreedKda(results) {
  const counts = new Map()
  for (const result of results) {
    if (!result || result.confidence < 60) continue
    const parsed = parseKdaRow(result.text)
    if (!parsed) continue
    const key = JSON.stringify(parsed)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  // Conflicting readings remain uncertain even if one reading has more votes.
  if (counts.size !== 1) return null
  const [key, count] = [...counts][0]
  return count >= 2 ? JSON.parse(key) : null
}

// Spaces between K / D / A are wider than gaps inside a multi-digit number.
// Locate five groups (number, slash, number, slash, number) without guessing values.
export function kdaNumberBoxes(image, box) {
  const runs = []
  let start = null
  for (let x = box.x; x <= Math.min(image.width, box.x + box.width); x++) {
    let ink = false
    if (x < box.x + box.width && x < image.width) {
      for (let y = box.y; y < Math.min(image.height, box.y + box.height); y++) {
        const i = (y * image.width + x) * 4
        const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2]
        if (r > 110 && g > 100 && Math.abs(r - g) < 65 && (b > 90 || r > 165 && g > 135)) {
          ink = true
          break
        }
      }
    }
    if (ink && start === null) start = x
    if (!ink && start !== null) {
      runs.push({ x: start, end: x })
      start = null
    }
  }
  if (runs.length < 5) return null
  const gaps = runs.slice(1).map((run, i) => ({ i, size: run.x - runs[i].end }))
    .sort((a, b) => b.size - a.size)
  const boundaries = gaps.slice(0, 4)
  if (boundaries.some(gap => gap.size < 4) ||
      (gaps[4] && boundaries[3].size < gaps[4].size * 1.5)) return null
  const split = new Set(boundaries.map(gap => gap.i))
  const groups = []
  let first = runs[0].x
  runs.forEach((run, i) => {
    if (split.has(i) || i === runs.length - 1) {
      groups.push({ x: first, y: box.y, width: run.end - first, height: box.height })
      first = runs[i + 1]?.x
    }
  })
  if (groups.length !== 5) return null
  return [groups[0], groups[2], groups[4]]
}
