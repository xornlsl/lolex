import { agreedOutcome } from './outcomeText'

function titleCrop(bitmap, threshold) {
  const source = document.createElement('canvas')
  source.width = bitmap.width
  source.height = Math.ceil(bitmap.height * .09)
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('이미지를 처리할 수 없습니다.')
  ctx.drawImage(bitmap, 0, 0)
  const pixels = ctx.getImageData(0, 0, source.width, source.height)
  const left = Math.round(bitmap.height * .115)
  const right = Math.min(bitmap.width, Math.round(bitmap.height * .48))
  let top = null, bottom = null, minX = right, maxX = left
  // The first bright text band after the mode icon is the result heading.
  // Its lower subtitle and scoreboard navigation are excluded.
  for (let y = 0; y < source.height; y++) {
    const ink = []
    for (let x = left; x < right; x++) {
      const i = (y * pixels.width + x) * 4
      const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2]
      if (r > 150 && g > 140 && b > 105 && Math.abs(r - g) < 55) ink.push(x)
    }
    if (ink.length >= 5) {
      if (top === null) top = y
      bottom = y
      minX = Math.min(minX, ink[0])
      maxX = Math.max(maxX, ink[ink.length - 1])
    } else if (bottom !== null && y - bottom > 3) break
  }
  if (top === null || bottom - top < 6) return null
  const x = Math.max(0, minX - 3), y = Math.max(0, top - 3)
  const width = Math.min(bitmap.width - x, maxX - x + 5)
  const height = Math.min(bitmap.height - y, bottom - y + 5)
  const canvas = document.createElement('canvas')
  canvas.width = width * 5 + 32
  canvas.height = height * 5 + 32
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('이미지를 처리할 수 없습니다.')
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, x, y, width, height, 16, 16, width * 5, height * 5)
  const output = context.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < output.data.length; i += 4) {
    const light = output.data[i] * .2126 + output.data[i + 1] * .7152 + output.data[i + 2] * .0722
    const value = threshold === null ? 255 - light : light > threshold ? 0 : 255
    output.data[i] = output.data[i + 1] = output.data[i + 2] = value
  }
  context.putImageData(output, 0, 0)
  return canvas
}

export async function readOutcome(file) {
  const bitmap = await createImageBitmap(file)
  let worker
  const attempts = []
  let preview
  try {
    const { createWorker } = await import('tesseract.js')
    worker = await createWorker('kor')
    for (const mode of ['7', '8']) {
      await worker.setParameters({ tessedit_pageseg_mode: mode })
      for (const threshold of [null, 110, 155]) {
        const canvas = titleCrop(bitmap, threshold)
        if (!canvas) continue
        preview ??= canvas.toDataURL('image/png')
        const { data } = await worker.recognize(canvas)
        attempts.push({ text: data.text.trim(), confidence: Math.round(data.confidence) })
      }
    }
    const outcome = agreedOutcome(attempts)
    if (outcome) return outcome
    const error = new Error('상단 제목 자동 인식 결과가 일치하지 않습니다. 아래 제목 인식 영역과 읽은 값을 확인해주세요. 결과는 저장되지 않았습니다.')
    error.diagnostics = preview ? [{ row: 'outcome', label: '승리·패배 제목', image: preview, attempts }] : []
    throw error
  } finally {
    bitmap.close()
    if (worker) await worker.terminate()
  }
}
