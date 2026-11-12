import type { SocketLike } from './channel-connection'
import { readProblem } from './problem'

export type ClientOptions = {
  /** Where `/api/v1` lives, without a trailing slash. Defaults to `/api/v1` on the current origin. */
  baseUrl?: string
  fetch?: typeof fetch
  headers?: () => Record<string, string>
  /** Called with the `X-Meta-Version` of every response; a change means `/meta` should be refetched. */
  onMetaVersion?: (version: string) => void
  /**
   * The bearer token for a request. Called with `refresh: true` when the server answered 401, so the
   * caller can fetch a new one; the request is then retried once.
   */
  token?: (options: { refresh: boolean }) => Promise<string | undefined>
  /** Called when a request is still 401 after the retry: the session is over. */
  onUnauthenticated?: () => void
  /** Opens the socket of `client.channel`; the global `WebSocket` by default. */
  webSocket?: (url: string, protocols: string[]) => SocketLike
}

/** The browser's fetch cache modes but `only-if-cached`, which fetch takes only with a same-origin mode the client never sends. */
export type CacheMode = Exclude<RequestCache, 'only-if-cached'>

export type Request = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  query?: string
  body?: unknown
  headers?: Record<string, string>
  /** Statuses other than 2xx that are an answer rather than an error. */
  accept?: number[]
  /** A system endpoint such as `/meta`: it lives beside the API (`/api/meta`), not inside it (`/api/v1`). */
  system?: boolean
  /** Sent as it is instead of a JSON `body`, such as a file. */
  raw?: Blob
  /** Sends this request instead of the client's fetch, such as one that reports upload progress. */
  via?: typeof fetch
  signal?: AbortSignal
  /** How the browser's HTTP cache treats the request, such as `no-store` for an answer only its caller may see. */
  cache?: CacheMode
}

/** Where the system endpoints beside the API live: `/api` for `/api/v1`. */
export const systemUrlOf = (baseUrl = '/api/v1') => baseUrl.replace(/\/[^/]*$/, '')

export const createTransport = (options: ClientOptions = {}) => {
  const baseUrl = options.baseUrl ?? '/api/v1'
  const systemUrl = systemUrlOf(baseUrl)
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))

  return async ({ method, path, query = '', body, headers, accept = [], system, raw, via, signal, cache }: Request) => {
    const attempt = async (refresh: boolean) => {
      const token = await options.token?.({ refresh })
      return (via ?? doFetch)(`${system ? systemUrl : baseUrl}${path}${query}`, {
        method,
        headers: {
          ...(body !== undefined && { 'content-type': 'application/json' }),
          ...(token && { authorization: `Bearer ${token}` }),
          ...options.headers?.(),
          ...headers,
        },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
        ...(signal && { signal }),
        ...(cache && { cache }),
      })
    }
    let response = await attempt(false)
    if (response.status === 401 && options.token) {
      response = await attempt(true)
      if (response.status === 401) options.onUnauthenticated?.()
    }
    const metaVersion = response.headers.get('x-meta-version')
    if (metaVersion) options.onMetaVersion?.(metaVersion)
    if (!response.ok && !accept.includes(response.status)) throw await readProblem(response)
    return response
  }
}

export type Transport = ReturnType<typeof createTransport>
