// Schedule after each response so slow requests cannot overwrite newer ones.
export function startQueuePolling({ load, onData, interval = 3000, schedule = setTimeout, cancel = clearTimeout }) {
  const controller = new AbortController()
  let timer
  let running = false
  const refresh = async () => {
    if (controller.signal.aborted || running) return
    cancel(timer)
    running = true
    try {
      const data = await load(controller.signal)
      if (!controller.signal.aborted) onData(data)
    } catch {
      // A temporary connection failure should not remove someone from the queue.
    } finally {
      running = false
      if (!controller.signal.aborted) timer = schedule(refresh, interval)
    }
  }
  timer = schedule(refresh, interval)
  return { refresh, stop() { controller.abort(); cancel(timer) } }
}
