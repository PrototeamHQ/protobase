import type { KeyValue } from '@protobase/schema'
import { readEventStream } from '@protobase/schema/internal'
import type { Transport } from './transport'
import type { ResourceRef } from './types'

/** A call on a record, as its readers see it: who started it, when, when it ended, who is in it and who was removed. */
export type RecordCall = {
  id: string
  started_by: string
  started_at: string
  /** `null` while it goes on. */
  ended_at: string | null
  members: { member: string; joined_at: string }[]
  removed: { member: string; removed_at: string }[]
}

export type RecordCallsHandlers = {
  /** The record's latest calls, newest first, the one going on first: at once, then whenever they change. */
  onCalls: (calls: RecordCall[]) => void
  /** The stream failed, with why, or ended (`undefined`); it is followed again after a pause. */
  onRetry?: (error: unknown) => void
}

type Key = KeyValue | readonly KeyValue[]

const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt)

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })

/** A record's calls, for whoever may read the record (`GET /api/{resource}/{key}:calls`). `path` names the record's calls. */
export const recordCallsClient = (send: Transport, path: (resource: ResourceRef, key: Key) => string, retryDelay: (attempt: number) => number = backoff) => ({
  /** The record's latest calls, newest first, the one going on first. */
  calls: async (resource: ResourceRef, key: Key): Promise<RecordCall[]> => ((await (await send({ method: 'GET', path: path(resource, key) })).json()) as { items: RecordCall[] }).items,
  /** Follows the record's calls until the returned function is called; a stream that ends or fails is followed again. */
  watchCalls: (resource: ResourceRef, key: Key, handlers: RecordCallsHandlers) => {
    const controller = new AbortController()
    const { signal } = controller
    let failures = 0
    const follow = async () => {
      const response = await send({ method: 'GET', path: path(resource, key), query: '?watch=true', headers: { accept: 'text/event-stream' }, signal })
      if (!response.body) throw new Error('The server answered the calls stream without a body')
      await readEventStream(response.body, (data) => {
        failures = 0
        handlers.onCalls((JSON.parse(data) as { items: RecordCall[] }).items)
      }, signal)
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
  },
})
