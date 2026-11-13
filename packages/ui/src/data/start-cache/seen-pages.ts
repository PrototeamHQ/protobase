/** An address the person opened, and the queries (by hash) that drew it on its latest visit. */
export type SeenPage = { address: string; queries: string[] }

/** How many of the last opened addresses keep their queries in the start cache. */
export const seenPagesLimit = 5

/** How many queries one page keeps at most, its latest, such as a page whose search asks again with every letter typed. */
export const pageQueriesLimit = 100

/**
 * The seen pages after `query` drew the page at `address`. Opening an address that is not the latest starts it over at
 * the front, so a page holds only what its latest visit used; only the `seenPagesLimit` most recent pages are kept.
 */
export const seenOn = (pages: readonly SeenPage[], address: string, query: string): SeenPage[] => {
  const [latest, ...rest] = pages
  if (latest?.address !== address) return [{ address, queries: [query] }, ...pages.filter((page) => page.address !== address)].slice(0, seenPagesLimit)
  if (latest.queries.includes(query)) return [...pages]
  return [{ address, queries: [...latest.queries, query].slice(-pageQueriesLimit) }, ...rest]
}

/** Every query the seen pages hold. */
export const seenQueries = (pages: readonly SeenPage[]) => new Set(pages.flatMap((page) => page.queries))
