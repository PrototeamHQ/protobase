import type { RelaySocketLike } from './relay-socket'
import { sseEvents } from './sse-events'

/** The header the relay takes a server-sent event connection's secret in, never the URL, since paths get logged. */
export const secretHeader = 'X-Connection-Secret'

/** The close code of a connection closed without one, as a WebSocket's that dropped. */
const droppedCode = 1006

// A network error, or the close aborting a request, ends the connection as dropped; anything else is a fault to show.
const networkFailure = (error: unknown) => error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')

type Connection = { connection: string; secret: string }

const connectionOf = (data: string): Connection | undefined => {
  const parsed = JSON.parse(data) as Partial<Connection>
  if (typeof parsed.connection !== 'string' || typeof parsed.secret !== 'string') return
  return { connection: parsed.connection, secret: parsed.secret }
}

/**
 * A connection to the relay over server-sent events, for a network that blocks WebSockets, shaped as the WebSocket the
 * relay's connection uses. `url` is the stream's address with its ticket; the relay's first event names the connection
 * and its secret, and it opens then. Each later unnamed event is a frame; frames sent go out by POST to
 * `<stream path>/<connection>`, in order, those sent while one is on its way together as an array. A `close` event
 * closes it with the relay's code, such as 1000 for good; a stream that ends or fails, or a POST the relay refuses,
 * closes it as dropped.
 */
export const sseSocket = (url: string, fetcher: typeof fetch): RelaySocketLike => {
  const aborted = new AbortController()
  let connection: Connection | undefined
  let queue: string[] = []
  let posting = false

  const end = (code: number, reason = '') => {
    if (socket.readyState === 3) return
    socket.readyState = 3
    aborted.abort()
    socket.onclose?.({ code, reason, wasClean: code === 1000 })
  }

  const failed = (error: unknown) => {
    posting = false
    end(droppedCode)
    if (!networkFailure(error)) throw error
  }

  const post = async (open: Connection) => {
    posting = true
    while (queue.length > 0 && socket.readyState === 1) {
      const frames = queue
      queue = []
      const body = frames.length === 1 ? frames[0] : `[${frames.join(',')}]`
      const sendUrl = `${url.slice(0, url.indexOf('?'))}/${encodeURIComponent(open.connection)}`
      const response = await fetcher(sendUrl, { method: 'POST', headers: { [secretHeader]: open.secret, 'Content-Type': 'application/json' }, body, signal: aborted.signal })
      if (!response.ok) end(droppedCode)
    }
    posting = false
  }

  const hear = ({ event, data }: { event: string; data: string }) => {
    if (event === 'connection') {
      connection = connectionOf(data)
      if (!connection) return end(droppedCode)
      socket.readyState = 1
      return socket.onopen?.({})
    }
    if (event === 'close') {
      const { code, reason } = JSON.parse(data) as { code: number; reason?: string }
      return end(code, reason)
    }
    if (event === 'message' && connection) socket.onmessage?.({ data })
  }

  const read = async () => {
    const response = await fetcher(url, { headers: { Accept: 'text/event-stream' }, cache: 'no-store', signal: aborted.signal })
    if (!response.ok || !response.body || !response.headers.get('Content-Type')?.startsWith('text/event-stream')) return end(droppedCode)
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    const parse = sseEvents()
    while (socket.readyState !== 3) {
      const { done, value } = await reader.read()
      if (done) return end(droppedCode)
      for (const event of parse(value)) hear(event)
    }
    await reader.cancel()
  }

  const socket: RelaySocketLike & { readyState: number } = {
    readyState: 0,
    onopen: null,
    onmessage: null,
    onclose: null,
    send: (data) => {
      if (socket.readyState === 0 || !connection) throw new Error('The relay connection is not open yet')
      if (socket.readyState === 3) return
      queue.push(data as string)
      if (!posting) void post(connection).catch(failed)
    },
    close: (code = 1005, reason = '') => end(code, reason),
  }

  void read().catch(failed)
  return socket
}
