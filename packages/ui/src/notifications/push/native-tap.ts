import { tapUrl } from '@protobase/schema/internal'

/** Where a notification's tap goes: a page of the app, by its path below the base path, or a url outside the app. */
export type NativeTapTarget = { kind: 'in-app'; path: string } | { kind: 'browser'; url: string }

export type NativeTapContext = {
  /** The origin of the server the app calls, whose pages open inside the app. */
  apiOrigin: string
  /** The user signed in now; without one a tap opens nothing. */
  userId: string | undefined
  /** The app's base path on that server. */
  basePath: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The target of a tap on a push, from the data the phone hands the app: its `url`, the one key the FCM and APNs senders
 * write the message's checked url to, checked again as the server checks it, for the user the push names, who must be the one
 * signed in. A url on the API's origin, compared as parsed origins, opens its page inside the app, by path, query and
 * hash, when that is a path below the base path that cannot be read as another origin (`//host`); a url on any other
 * origin opens outside the app. Anything else opens nothing, and no other key is ever read in its place.
 */
export const nativeTapTarget = (data: unknown, { apiOrigin, userId, basePath }: NativeTapContext): NativeTapTarget | undefined => {
  if (!isRecord(data) || userId === undefined || data.user !== userId) return
  const url = tapUrl(data.url)
  if (url === undefined) return
  const parsed = new URL(url)
  if (parsed.origin !== apiOrigin) return { kind: 'browser', url }
  const full = `${parsed.pathname}${parsed.search}${parsed.hash}`
  if (full.startsWith('//') || new URL(full, apiOrigin).origin !== apiOrigin) return
  if (basePath === '') return { kind: 'in-app', path: full }
  if (parsed.pathname !== basePath && !parsed.pathname.startsWith(`${basePath}/`)) return
  const path = full.slice(basePath.length)
  return { kind: 'in-app', path: path.startsWith('/') ? path : `/${path}` }
}
