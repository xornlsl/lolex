import test from 'node:test'
import assert from 'node:assert/strict'
import { agreedKda, findTextBands, isScoreboardLayout, parseKdaRow, kdaNumberBoxes } from './scoreboardGeometry.js'

test('separate KDA numbers without splitting multi-digit numbers', () => {
  const width = 120, height = 20
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [start, end] of [[5, 12], [14, 21], [35, 39], [53, 60], [74, 78], [92, 99], [101, 108]]) {
    for (let y = 4; y < 15; y++) for (let x = start; x < end; x++) {
      data.set([200, 200, 190, 255], (y * width + x) * 4)
    }
  }
  const boxes = kdaNumberBoxes({ data, width, height }, { x: 0, y: 0, width, height })
  assert.deepEqual(boxes.map(({ x, width }) => [x, width]), [[5,16], [53,7], [92,16]])
  assert.equal(kdaNumberBoxes({ data: new Uint8ClampedArray(data.length), width, height },
    { x: 0, y: 0, width, height }), null)
})

test('only complete, unambiguous KDA triples are accepted', () => {
  assert.deepEqual(parseKdaRow(' 10 / 15 / 12\n'), { kills: 10, deaths: 15, assists: 12 })
  for (const value of ['10/15', '1O/15/12', '10/15/12 265', '10/15/12\n2/4/6']) {
    assert.equal(parseKdaRow(value), null)
  }
})

test('two confident readings must agree; conflicting readings stay blocked', () => {
  const reading = text => ({ text, confidence: 90 })
  assert.deepEqual(agreedKda([reading('4/0/10'), reading('4 / 0 / 10')]),
    { kills: 4, deaths: 0, assists: 10 })
  assert.equal(agreedKda([reading('4/0/10')]), null)
  assert.equal(agreedKda([reading('4/0/10'), reading('4/0/10'), reading('4/8/10')]), null)
  assert.equal(agreedKda([reading('4/0/10'), { text: '4/0/10', confidence: 20 }]), null)
})

test('actual pixel bands survive offsets/scaling and exclude colored team totals', () => {
  for (const scale of [1, 2]) {
    const width = 140 * scale
    const height = 600 * scale
    const data = new Uint8ClampedArray(width * height * 4)
    const centers = [90, 125, 160, 195, 230, 300, 335, 370, 405, 440].map(y => y * scale)
    const draw = (center, color) => {
      for (let y = center - 4 * scale; y <= center + 4 * scale; y++) {
        for (let x = 30 * scale; x < 60 * scale; x++) {
          data.set([...color, 255], (y * width + x) * 4)
        }
      }
    }
    centers.forEach((y, i) => draw(y, i === 0 ? [250, 210, 0] : [195, 194, 177]))
    draw(60 * scale, [0, 180, 210])
    draw(270 * scale, [230, 0, 50])
    const bands = findTextBands({ data, width, height }, 20 * scale, 70 * scale)
    assert.deepEqual(bands.map(row => row.rowY), centers)
    assert.equal(isScoreboardLayout(bands), true)
    assert.equal(isScoreboardLayout(bands.slice(0, 8)), false)
    assert.equal(isScoreboardLayout([...bands, bands[9]]), false)
  }
})
