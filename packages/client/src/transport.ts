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
}

export type Request = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  query?: string
  body?: unknown
  headers?: Record<string, string>
  /** Statuses other than 2xx that are an answer rather than an error. */
  accept?: number[]
  /** A system endpoint such as `/meta`: it lives beside the API (`/api/meta`), not inside it (`/api/v1`). */
  system?: boolean
}

export const createTransport = (options: ClientOptions = {}) => {
  const baseUrl = options.baseUrl ?? '/api/v1'
  const systemUrl = baseUrl.replace(/\/[^/]*$/, '')
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))

  return async ({ method, path, query = '', body, headers, accept = [], system }: Request) => {
    const attempt = async (refresh: boolean) => {
      const token = await options.token?.({ refresh })
      return doFetch(`${system ? systemUrl : baseUrl}${path}${query}`, {
        method,
        headers: {
          ...(body !== undefined && { 'content-type': 'application/json' }),
          ...(token && { authorization: `Bearer ${token}` }),
          ...options.headers?.(),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
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
