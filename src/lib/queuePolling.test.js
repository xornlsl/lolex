import test from 'node:test'
import assert from 'node:assert/strict'
import { startQueuePolling } from './queuePolling.js'

function timers() {
  const pending = new Map()
  let id = 0
  return {
    pending,
    schedule(fn, delay) { pending.set(++id, { fn, delay }); return id },
    cancel(key) { pending.delete(key) },
    async tick() {
      const [key, task] = pending.entries().next().value
      pending.delete(key)
      await task.fn()
    },
  }
}

test('waiting participants receive a match without refreshing, even after a network failure', async () => {
  const clock = timers()
  const received = []
  let calls = 0
  const polling = startQueuePolling({ ...clock,
    load: async () => {
      if (++calls === 1) throw new Error('offline')
      return calls === 2 ? { queue: { id: 1 } } : { active_match: { id: 42, status: 'matched' } }
    },
    onData: data => received.push(data),
  })
  assert.equal([...clock.pending.values()][0].delay, 3000)
  await clock.tick()
  await clock.tick()
  await clock.tick()
  assert.equal(received[1].active_match.id, 42)
  polling.stop()
  assert.equal(clock.pending.size, 0)
})

test('focus refresh cannot overlap requests and stopped requests cannot update the screen', async () => {
  const clock = timers()
  let resolve
  let signal
  let calls = 0
  const received = []
  const polling = startQueuePolling({ ...clock,
    load: requestSignal => {
      signal = requestSignal
      calls++
      return new Promise(done => { resolve = done })
    },
    onData: data => received.push(data),
  })
  const request = polling.refresh()
  await polling.refresh()
  assert.equal(calls, 1)
  polling.stop()
  assert.equal(signal.aborted, true)
  resolve({ active_match: { id: 42 } })
  await request
  assert.deepEqual(received, [])
  assert.equal(clock.pending.size, 0)
})
