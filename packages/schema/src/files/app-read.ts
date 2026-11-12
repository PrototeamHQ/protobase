/** The query parameter that asks a file link for its bytes from the app itself, never a redirect to the file's store. */
export const appReadParam = 'via'

const appReadValue = 'app'

/** The largest file the app serves through such a read: a viewer reads documents, while images and video use the plain link. */
export const appReadMaxBytes = 10 * 1024 * 1024

/** Where an API serves files, beside its system path (`/api`): `/api/files`. */
export const filesPath = (systemPath: string) => `${systemPath}/files`

/** The address of a provider's file under `files`, a `filesPath`: `/api/files/private/acme/2992db9c-….jpg`. */
export const filePath = (files: string, provider: string, path: string) => `${files}/${provider}/${path}`

/** The provider and path of a stored file value (`private:acme/2992db9c-….jpg?name=bike.png`); `undefined` for a URL. */
export const storedFileRef = (uri: string) => {
  const match = /^([a-z][a-z0-9-]*):([A-Za-z0-9_-][^?#]*)/.exec(uri)
  return match ? { provider: match[1]!, path: match[2]! } : undefined
}

/**
 * A link to a file on the app that answers with the bytes from the app's own origin, for a page that reads the file
 * with `fetch`: the plain link may redirect to a bucket that sends no CORS headers.
 */
export const appReadUrl = (url: string) => `${url}${url.includes('?') ? '&' : '?'}${appReadParam}=${appReadValue}`

/** Whether a file request asks for an app read. */
export const isAppRead = (query: URLSearchParams) => query.get(appReadParam) === appReadValue
