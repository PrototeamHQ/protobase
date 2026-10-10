/**
 * Reads a `text/event-stream` body and calls `onData` with the data of every event, its `data:` lines joined by
 * newlines. Comments, event names and ids are skipped: the assistant protocol and chat completions only use data.
 * Aborting `signal` cancels the body and resolves.
 */
export const readEventStream = async (body: ReadableStream<Uint8Array>, onData: (data: string) => void, signal?: AbortSignal) => {
  const decoder = new TextDecoder()
  const reader = body.getReader()
  signal?.addEventListener('abort', () => void reader.cancel(), { once: true })
  let buffer = ''
  let data: string[] = []
  const line = (text: string) => {
    if (text === '') {
      if (data.length > 0) onData(data.join('\n'))
      data = []
      return
    }
    if (text.startsWith('data:')) data.push(text.slice(text.startsWith('data: ') ? 6 : 5))
  }
  for (;;) {
    const { done, value } = await reader.read()
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r\n|\r|\n/)
    buffer = done ? '' : (lines.pop() ?? '')
    lines.forEach(line)
    if (done) return line('')
  }
}
