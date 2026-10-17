import { ApiError, readProblem } from './problem'

export type RuntimePolicy = 'immediate' | 'weekly' | 'scheduled' | 'manual'

/** What a running update does: `job` moves the app to the release, `build` builds and deploys it. */
export type RuntimeUpdateStage = 'job' | 'build'

/** How the latest finished update ended; `message` is for the app's owner and null when there is nothing to say. */
export type RuntimeLastUpdate = {
  toVersion: string
  outcome: 'succeeded' | 'unchanged' | 'failed'
  errorCode: string | null
  message: string | null
  finishedAt: string
}

/**
 * What the runtime endpoint answers: the app's pinned `version`, the `latest` release, whether to show that an update
 * is available (`indicator`), when the `policy` applies `latest` (`nextUpdateAt`, null when it never will or nothing
 * is pending) and whether an update is running. A newer endpoint also names the running update's stage and start, and
 * how the last one ended; an older one leaves them out.
 */
export type RuntimeStatus = {
  version: string
  latest: string
  updateAvailable: boolean
  indicator: boolean
  policy: RuntimePolicy
  nextUpdateAt: string | null
  updating: boolean
  updateStage?: RuntimeUpdateStage | null
  updateStartedAt?: string | null
  lastUpdate?: RuntimeLastUpdate | null
}

export type RuntimeClientOptions = {
  /** The runtime endpoint, as `/api/meta` names it. */
  url: string
  /** The signed-in user's API token, sent as the bearer token of every request. */
  token: () => string | undefined | Promise<string | undefined>
  fetch?: typeof fetch
}

export type RuntimeClient = {
  /** `GET {url}`. Rejects with `ApiError`. */
  status: () => Promise<RuntimeStatus>
  /** `POST {url}/update`: applies the latest version now. Rejects with `ApiError`, status 409 when already on it or an update is running. */
  update: () => Promise<RuntimeStatus>
}

type Refusal = { error: { code: string; message: string } }

const isRefusal = (body: unknown): body is Refusal =>
  typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'object' && body.error !== null && 'code' in body.error && 'message' in body.error

// The endpoint refuses with `{ error: { code, message } }` or with problem+json; either becomes an `ApiError` whose
// `detail` is the endpoint's own message.
const readRefusal = async (response: Response) => {
  const isJson = response.headers.get('content-type')?.includes('json') ?? false
  const body: unknown = isJson ? await response.clone().json() : undefined
  if (!isRefusal(body)) return readProblem(response)
  return new ApiError({ type: `urn:protobase:problem:${body.error.code}`, title: response.statusText || 'Request failed', status: response.status, detail: body.error.message })
}

/** A client of the runtime endpoint, with the user's token. */
export const createRuntimeClient = (options: RuntimeClientOptions): RuntimeClient => {
  const base = options.url.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))

  const request = async (path: string, method: 'GET' | 'POST') => {
    const token = await options.token()
    const response = await doFetch(`${base}${path}`, { method, headers: { accept: 'application/json', ...(token && { authorization: `Bearer ${token}` }) } })
    if (!response.ok) throw await readRefusal(response)
    return (await response.json()) as RuntimeStatus
  }

  return {
    status: () => request('', 'GET'),
    update: () => request('/update', 'POST'),
  }
}
