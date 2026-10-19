import { readEventStream } from '@protobase/schema/internal'
import { queryString } from './query-string'
import type { Transport } from './transport'

/** A record of a `.live()` resource that changed: its key, never its values. */
export type LiveChange = { resource: string; key: string; operation: 'create' | 'update' | 'delete' | 'undelete' }

export type LiveHandlers = {
  /** The records that changed, in commit order, of the live resources the caller may read. */
  onChanges: (changes: LiveChange[]) => void
  /** Changes went by while the connection was down for longer than the server keeps them: read everything shown again. */
  onResync: () => void
  /** The stream failed, with why, or ended (`undefined`); it is followed again after a pause. */
  onRetry?: (error: unknown) => void
}

type LiveEvent = { type: 'current' | 'resync'; cursor: string } | { type: 'changes'; cursor: string; changes: LiveChange[] }

const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt)

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })

/**
 * Follows `GET /api/live` until the returned function is called: a stream that ends or fails is followed again, after
 * a pause that grows with each failure, from the last event it had, so nothing in between is missed.
 */
export const followLive = (send: Transport, handlers: LiveHandlers, retryDelay: (attempt: number) => number = backoff) => {
  const controller = new AbortController()
  const { signal } = controller
  let cursor: string | undefined
  let failures = 0

  const onEvent = (event: LiveEvent) => {
    failures = 0
    cursor = event.cursor
    if (event.type === 'resync') handlers.onResync()
    if (event.type === 'changes') handlers.onChanges(event.changes)
  }

  const follow = async () => {
    const response = await send({ method: 'GET', path: '/live', query: queryString({ after: cursor }), headers: { accept: 'text/event-stream' }, system: true, signal })
    if (!response.body) throw new Error('The server answered the live stream without a body')
    await readEventStream(response.body, (data) => onEvent(JSON.parse(data) as LiveEvent), signal)
  }

  void (async () => {
    while (!signal.aborted) {
      const error = await follow().then(() => undefined, (reason: unknown) => reason)
      if (signal.aborted) return
      handlers.onRetry?.(error)
      await pause(retryDelay(failures++), signal)
    }
  })()
  return () => controller.abort()
}
