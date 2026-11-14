import { createParser } from 'eventsource-parser'

// A body from a fetch given the same signal is already errored with an AbortError when the listener cancels it
const ignoreAbort = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return
  throw error
}

/**
 * Reads a `text/event-stream` body and calls `onData` with the data of every event, its `data:` lines joined by
 * newlines. Comments, event names and ids are skipped: the assistant protocol and chat completions only use data.
 * Aborting `signal` cancels the body and resolves.
 */
export const readEventStream = async (body: ReadableStream<Uint8Array>, onData: (data: string) => void, signal?: AbortSignal) => {
  const parser = createParser({ onEvent: (event) => onData(event.data) })
  const decoder = new TextDecoder()
  const reader = body.getReader()
  signal?.addEventListener('abort', () => void reader.cancel().catch(ignoreAbort), { once: true })
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parser.feed(decoder.decode(value, { stream: true }))
  }
  // An event the body ends without a blank line after still counts
  parser.feed(`${decoder.decode()}\n\n`)
}
