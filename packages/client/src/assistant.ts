import { readEventStream, type AssistantActionRequest, type AssistantEvent, type AssistantMessageRequest } from '@protobase/schema'
import { readProblem } from './problem'

export type AssistantClientOptions = {
  /** The backend's URL, as `/api/meta` names it: absolute, or a path on the app's own origin. */
  url: string
  /** The signed-in user's API token, sent as the bearer token of every request. */
  token: () => string | undefined | Promise<string | undefined>
  fetch?: typeof fetch
  /** How long to wait before reconnecting after the `attempt`th failure in a row. */
  retryDelayMs?: (attempt: number) => number
}

/** `retrying` carries why the last connection failed or ended. */
export type AssistantConnection = { state: 'connecting' } | { state: 'open' } | { state: 'retrying'; error?: unknown }

export type AssistantClient = {
  /** Follows the event stream, reconnecting until the returned function is called; every connection starts with a `state` event. */
  connect: (onEvent: (event: AssistantEvent) => void, onConnection?: (connection: AssistantConnection) => void) => () => void
  /** Sends a message, with the page the user is on when given; the reply arrives as events. Rejects with `ApiError`. */
  send: (text: string, page?: string) => Promise<void>
  /** Sends a click on a card's button; the backend answers with events. Rejects with `ApiError`. */
  act: (partId: string, actionId: string) => Promise<void>
}

const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt)

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })

/** A client of an assistant backend: the protocol's event stream and its two requests, with the user's token. */
export const createAssistantClient = (options: AssistantClientOptions): AssistantClient => {
  const base = options.url.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))
  const retryDelay = options.retryDelayMs ?? backoff

  const request = async (path: string, init: { method: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }) => {
    const token = await options.token()
    const response = await doFetch(`${base}${path}`, {
      method: init.method,
      headers: {
        ...(init.body === undefined ? { accept: 'text/event-stream' } : { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    })
    if (!response.ok) throw await readProblem(response)
    return response
  }

  const follow = async (signal: AbortSignal, onEvent: (event: AssistantEvent) => void, onOpen: () => void) => {
    const response = await request('/events', { method: 'GET', signal })
    if (!response.body) throw new Error('The assistant backend answered the event stream without a body')
    onOpen()
    await readEventStream(response.body, (data) => onEvent(JSON.parse(data) as AssistantEvent), signal)
  }

  return {
    connect: (onEvent, onConnection) => {
      const controller = new AbortController()
      const { signal } = controller
      void (async () => {
        let failures = 0
        while (!signal.aborted) {
          onConnection?.({ state: 'connecting' })
          // A stream that ends or fails is followed again; what went wrong goes to onConnection.
          const error = await follow(signal, onEvent, () => {
            failures = 0
            onConnection?.({ state: 'open' })
          }).then(() => undefined, (reason: unknown) => reason ?? new Error('The assistant stream failed'))
          if (signal.aborted) return
          onConnection?.({ state: 'retrying', ...(error !== undefined && { error }) })
          await pause(retryDelay(failures++), signal)
        }
      })()
      return () => controller.abort()
    },
    send: async (text, page) => {
      await request('/messages', { method: 'POST', body: { text, ...(page && { page }) } satisfies AssistantMessageRequest })
    },
    act: async (partId, actionId) => {
      await request('/actions', { method: 'POST', body: { partId, actionId } satisfies AssistantActionRequest })
    },
  }
}
