import { findTextBands, isScoreboardLayout, agreedKda, kdaNumberBoxes } from './scoreboardGeometry'

function crop(bitmap, box, threshold, scale = 4) {
  const canvas = document.createElement('canvas')
  const padding = 12
  canvas.width = Math.round(box.width * scale) + padding * 2
  canvas.height = Math.round(box.height * scale) + padding * 2
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('이미지를 처리할 수 없습니다.')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, box.x, box.y, box.width, box.height,
    padding, padding, canvas.width - padding * 2, canvas.height - padding * 2)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const light = pixels.data[i] * .2126 + pixels.data[i + 1] * .7152 + pixels.data[i + 2] * .0722
    const value = threshold === null ? 255 - light : light > threshold ? 0 : 255
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value
  }
  ctx.putImageData(pixels, 0, 0)
  return canvas
}

export async function readScoreboard(file, report = () => {}) {
  const bitmap = await createImageBitmap(file)
  let worker
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('이미지를 처리할 수 없습니다.')
    ctx.drawImage(bitmap, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const candidates = []
    // Relative sizes cover screenshots with and without the right stats panel;
    // all ten vertical positions still come from the actual pixels.
    for (const boardWidth of [bitmap.width, bitmap.width * .79, bitmap.height * 1.32]) {
      for (const fraction of [.625, .64, .65]) {
        const x = Math.round(boardWidth * fraction)
        const width = Math.round(boardWidth * .145)
        if (x + width > bitmap.width) continue
        const rows = findTextBands(pixels, x, width)
        if (isScoreboardLayout(rows)) candidates.push({ x, width, rows })
      }
    }
    if (!candidates.length) {
      throw new Error('10명의 숫자 행 위치를 구분하지 못했습니다. 승패와 10명 전원이 보이는 원본 PNG를 사용해주세요. 화면을 잘라내거나 크기를 줄이지 말아주세요.')
    }
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('eng')
    await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789/ ' })
    let best = []
    let bestDiagnostics = []
    let bestCandidate = null
    let selected
    for (const candidate of candidates) {
      const readings = []
      const diagnostics = []
      for (const [index, band] of candidate.rows.entries()) {
        report('K/D/A ' + (index + 1) + '/10명 교차 확인 중')
        const box = { x: candidate.x, y: Math.max(0, band.top - 3),
          width: candidate.width, height: band.bottom - band.top + 7 }
        const attempts = []
        for (const threshold of [null, 85, 125]) {
          const { data } = await worker.recognize(crop(bitmap, box, threshold))
          attempts.push({ text: data.text, confidence: data.confidence })
        }
        let reading = agreedKda(attempts)
        const numberBoxes = kdaNumberBoxes(pixels, box)
        if (!reading && numberBoxes) {
          // A slash or large spaces can confuse whole-line OCR. Read each
          // detected number separately, still requiring independent agreement.
          await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789' })
          const numbers = []
          for (const numberBox of numberBoxes) {
            const votes = []
            for (const threshold of [null, 85, 125]) {
              const { data } = await worker.recognize(crop(bitmap, numberBox, threshold, 5))
              const text = data.text.trim()
              if (data.confidence >= 60 && /^\d{1,3}$/.test(text)) votes.push(Number(text))
            }
            numbers.push(votes.length >= 2 && new Set(votes).size === 1 ? votes[0] : null)
          }
          await worker.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789/ ' })
          if (numbers.every(number => number !== null)) {
            const combined = numbers.join('/')
            // Retain any confident conflicting whole-row reading as a blocker.
            reading = agreedKda([...attempts,
              { text: combined, confidence: 100 }, { text: combined, confidence: 100 }])
          }
        }
        readings.push(reading)
        diagnostics.push({ row: index + 1, confirmed: Boolean(reading),
          image: crop(bitmap, box, null).toDataURL('image/png'),
          attempts: attempts.map(attempt => ({ text: attempt.text.trim(), confidence: Math.round(attempt.confidence) })) })
      }
      if (!best.length || readings.filter(Boolean).length > best.filter(Boolean).length) {
        best = readings
        bestDiagnostics = diagnostics
        bestCandidate = candidate
      }
      if (readings.every(Boolean)) { selected = { ...candidate, readings }; break }
    }
    selected ??= bestCandidate ? { ...bestCandidate, readings: best } : null
    if (!selected) throw new Error('K/D/A 행을 찾지 못했습니다. 전적 화면 전체가 보이는 원본을 올려주세요.')
    await worker.terminate()
    worker = null
    worker = await createWorker(['kor', 'eng'])
    await worker.setParameters({ tessedit_pageseg_mode: '7' })
    let result = []
    const nameDiagnostics = []
    for (const [index, band] of selected.rows.entries()) {
      report('닉네임 ' + (index + 1) + '/10명 확인 중')
      const box = { x: Math.round(selected.x * .25), y: Math.max(0, band.top - 4),
        width: Math.round(selected.x * .285), height: band.bottom - band.top + 9 }
      const readings = []
      const nameImage = crop(bitmap, box, null)
      for (const threshold of [null, 80]) {
        const { data } = await worker.recognize(crop(bitmap, box, threshold))
        if (data.confidence >= 55) readings.push({
          text: data.text.trim().normalize('NFKC'),
          confidence: Math.round(data.confidence),
        })
      }
      const recognizedName = readings.length === 2 &&
        readings[0].text.replace(/\s/g, '') === readings[1].text.replace(/\s/g, '') &&
        readings[0].text.trim().length > 0
      if (!recognizedName) nameDiagnostics.push({
        kind: 'name', row: index + 1, label: (index + 1) + '번째 선수 닉네임',
        confirmed: false, image: nameImage.toDataURL('image/png'),
        attempts: readings,
      })
      result.push({
        ...(selected.readings[index] || { kills: null, deaths: null, assists: null }),
        riotName: recognizedName ? readings[0].text : '',
        recognized: Boolean(selected.readings[index]),
        recognizedName,
      })
    }
    const nameCounts = new Map()
    result.forEach(row => {
      const key = row.riotName.replace(/\s/g, '').toLowerCase()
      if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1)
    })
    result = result.map((row, index) => {
      const key = row.riotName.replace(/\s/g, '').toLowerCase()
      if (!key || nameCounts.get(key) === 1) return row
      nameDiagnostics.push({
        kind: 'name', row: index + 1, label: (index + 1) + '번째 선수 닉네임 중복 인식',
        confirmed: false, image: '', attempts: [{ text: row.riotName, confidence: 0 }],
      })
      return { ...row, riotName: '', recognizedName: false }
    })
    return {
      rows: result,
      diagnostics: [
        ...bestDiagnostics.filter(item => !item.confirmed).map(item => ({ ...item, kind: 'kda' })),
        ...nameDiagnostics,
      ],
      recognizedCount: result.filter(row => row.recognized).length,
      recognizedNameCount: result.filter(row => row.recognizedName).length,
    }
  } finally {
    bitmap.close()
    if (worker) await worker.terminate()
  }
}
