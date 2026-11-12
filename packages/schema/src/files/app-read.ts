/** The query parameter that asks a file link for its bytes from the app itself, never a redirect to the file's store. */
export const appReadParam = 'via'

const appReadValue = 'app'

/** The largest file the app serves through such a read: a viewer reads documents, while images and video use the plain link. */
export const appReadMaxBytes = 10 * 1024 * 1024

/**
 * A file link that answers with the bytes from the app's own origin, for a page that reads the file with `fetch`: the
 * plain link may redirect to a bucket that sends no CORS headers. A link with another scheme, such as `data:`, as is.
 */
export const appReadUrl = (url: string) => {
  if (!url.startsWith('/') && !/^https?:\/\//i.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}${appReadParam}=${appReadValue}`
}

/** Whether a file request asks for an app read. */
export const isAppRead = (query: URLSearchParams) => query.get(appReadParam) === appReadValue
