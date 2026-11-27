import { readFileSync } from 'node:fs'

/**
 * A stream the relay recorded in its integration tests, its connection id and secret left as `<connection>` and
 * `<secret>`: protobase-realtime's `tests/testdata/sse-stream.txt` at commit 23b2101, copied as it is.
 */
export const recordedStream = readFileSync(new URL('./sse-stream.txt', import.meta.url), 'utf8')

type Post = { url: string; secret: string | null; body: string }

/**
 * The relay's end of a test's server-sent event connections: `write` sends text on the latest stream and `end` ends it;
 * each POST is kept in `posts`, and answered with `status` once `answer` is called, or 204 at once when `holdPosts` is
 * off.
 */
export const fakeSseRelay = ({ holdPosts = false } = {}) => {
  const streams: { url: string; controller: ReadableStreamDefaultController<Uint8Array> }[] = []
  const posts: Post[] = []
  const held: ((status: number) => void)[] = []
  const encoder = new TextEncoder()
  let streamStatus = 200
  let streamType = 'text/event-stream'

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') {
      posts.push({ url, secret: new Headers(init.headers).get('X-Connection-Secret'), body: String(init.body) })
      if (!holdPosts) return new Response(null, { status: 204 })
      return new Promise<Response>((resolve) => held.push((status) => resolve(new Response(null, { status }))))
    }
    const body = new ReadableStream<Uint8Array>({ start: (controller) => void streams.push({ url, controller }) })
    // As fetch does, the close aborting the request errors the stream.
    init?.signal?.addEventListener('abort', () => streams.find((stream) => stream.url === url)?.controller.error(new DOMException('aborted', 'AbortError')))
    return new Response(body, { status: streamStatus, headers: { 'Content-Type': streamType } })
  }) as typeof fetch

  const latest = () => streams.at(-1)!
  return {
    fetcher,
    posts,
    streams,
    write: (text: string) => latest().controller.enqueue(encoder.encode(text)),
    end: () => latest().controller.close(),
    answer: (status = 204) => held.shift()!(status),
    refuseStreams: (status: number, type = 'text/plain') => {
      streamStatus = status
      streamType = type
    },
  }
}
