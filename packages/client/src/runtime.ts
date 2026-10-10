import { readProblem } from './problem'

export type RuntimePolicy = 'immediate' | 'weekly' | 'scheduled' | 'manual'

/**
 * What the runtime endpoint answers: the app's pinned `version`, the `latest` release, whether to show that an update
 * is available (`indicator`), when the `policy` applies `latest` (`nextUpdateAt`, null when it never will or nothing
 * is pending) and whether an update is running.
 */
export type RuntimeStatus = {
  version: string
  latest: string
  updateAvailable: boolean
  indicator: boolean
  policy: RuntimePolicy
  nextUpdateAt: string | null
  updating: boolean
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

/** A client of the runtime endpoint, with the user's token. */
export const createRuntimeClient = (options: RuntimeClientOptions): RuntimeClient => {
  const base = options.url.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))

  const request = async (path: string, method: 'GET' | 'POST') => {
    const token = await options.token()
    const response = await doFetch(`${base}${path}`, { method, headers: { accept: 'application/json', ...(token && { authorization: `Bearer ${token}` }) } })
    if (!response.ok) throw await readProblem(response)
    return (await response.json()) as RuntimeStatus
  }

  return {
    status: () => request('', 'GET'),
    update: () => request('/update', 'POST'),
  }
}
