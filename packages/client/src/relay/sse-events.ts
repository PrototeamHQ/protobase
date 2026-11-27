/** One server-sent event: its `event` name, `message` when the stream named none, and its data lines joined. */
export type SseEvent = { event: string; data: string }

/**
 * Reads a server-sent event stream as its text comes in, in pieces of any size, as the HTML standard's event stream
 * parsing does for `event` and `data`: comments, `id` and `retry` are skipped, and an event without data is none.
 */
export const sseEvents = () => {
  let buffer = ''
  let event = ''
  let data: string[] = []

  const field = (line: string, events: SseEvent[]) => {
    if (line === '') {
      if (data.length > 0) events.push({ event: event || 'message', data: data.join('\n') })
      event = ''
      data = []
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const name = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (name === 'event') event = value
    if (name === 'data') data.push(value)
  }

  /** The events the text completes; a line it leaves open waits for the next piece. */
  return (text: string) => {
    const events: SseEvent[] = []
    buffer += text
    // A lone `\r` at the end may be the first half of `\r\n`, so it waits too.
    const lines = buffer.split(/\r\n|\r(?!$)|\n/)
    buffer = lines.pop()!
    for (const line of lines) field(line, events)
    return events
  }
}
