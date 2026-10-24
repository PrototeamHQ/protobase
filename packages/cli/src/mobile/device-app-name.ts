import { shownAppName, webManifestPath } from '@protobase/server'

export type DeviceAppNameInput = {
  /** The server the app calls. */
  url: URL
  /** The project's auth, which may name the app. */
  auth: { appName?: string } | undefined
  env: Record<string, string | undefined>
  /** A store release, which never takes a name its server did not answer. */
  release?: boolean
  fetch?: typeof fetch
  onWarning: (message: string) => void
}

// The admin app's page links the manifest under the system path, as the server answers it.
const manifestUrl = (url: URL) => new URL(`/api${webManifestPath}`, url.origin)

// The name in the manifest the server answers, `undefined` when it answers none; throws when it cannot be reached.
const manifestName = async (url: URL, fetchFn: typeof fetch) => {
  const response = await fetchFn(manifestUrl(url), { signal: AbortSignal.timeout(10_000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return undefined
  const { name } = (await response.json()) as { name?: unknown }
  return typeof name === 'string' && name.trim() ? name : undefined
}

const isUnreachable = (error: unknown) => error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')

/**
 * The name the installed app goes by on the device: the one its server names it with in the upper left, which the
 * platform may set (`PROTOBASE_APP_NAME`) apart from the project. When the server answers no name or cannot be reached,
 * a release stops, and any other build warns and takes the name the project gives itself.
 */
export const deviceAppName = async ({ url, auth, env, release, fetch: fetchFn = fetch, onWarning }: DeviceAppNameInput) => {
  const answered = await manifestName(url, fetchFn).catch((error: unknown) => {
    if (!isUnreachable(error)) throw error
    return undefined
  })
  if (answered) return answered
  const what = `${url.origin} answered no app name at ${manifestUrl(url).pathname}`
  if (release) throw new Error(`${what}, the name the release is installed under: build it against the app's running server`)
  const own = shownAppName(auth, env)
  onWarning(`${what}: the app is installed as "${own}", the name this project gives itself`)
  return own
}
