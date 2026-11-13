// The live updater's reload loads the release at its start page; this key holds the page it left until it is back.
const keptPageKey = 'protobase.liveUpdate.page'

type PageStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type PageLocation = Pick<Location, 'pathname' | 'search' | 'hash'>
type PageHistory = Pick<History, 'state' | 'replaceState'>

// One path on this origin: `//host` would name another.
const isOwnPath = (url: unknown): url is string => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')

/** Keeps the page the app shows, and its history entry, whose scroll position the router restores. */
export const keepPage = (storage: PageStorage, location: PageLocation, history: PageHistory) => {
  const state = history.state as { protobaseEntry?: unknown } | null
  const entry = typeof state?.protobaseEntry === 'string' ? state.protobaseEntry : undefined
  storage.setItem(
    keptPageKey,
    JSON.stringify({
      url: `${location.pathname}${location.search}${location.hash}`,
      entry,
    }),
  )
}

export const forgetPage = (storage: PageStorage) => storage.removeItem(keptPageKey)

/** Before the app draws, returns to the page `keepPage` kept, once; anything else in its place is dropped. */
export const restorePage = (storage: PageStorage, history: PageHistory) => {
  const kept = storage.getItem(keptPageKey)
  if (kept === null) return
  forgetPage(storage)
  let page: unknown
  try {
    page = JSON.parse(kept)
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
  if (typeof page !== 'object' || page === null) return
  const { url, entry } = page as { url?: unknown; entry?: unknown }
  if (!isOwnPath(url)) return
  history.replaceState(typeof entry === 'string' ? { protobaseEntry: entry } : null, '', url)
}
