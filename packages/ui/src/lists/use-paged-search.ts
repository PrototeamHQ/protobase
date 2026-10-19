import { useEffect, useRef, useState } from 'react'

/** A page of what a search found, and how many there are in all. */
export type FoundPage<Item> = { items: Item[]; total: number }

/** What `usePagedSearch` shows: the items found so far, the total, `more` for the next page, and whether a page is on its way. */
export type PagedSearch<Item> = { found: Item[]; total: number; more: () => Promise<void>; loading: boolean }

/**
 * What `search` finds for `query`, a page at a time (searched 200 ms after the text stops changing). `more` adds the
 * next page. A page that arrives after the text changed is dropped, so it never adds rows of the old filter. `search`
 * must keep its identity between renders, or each render searches again.
 */
export const usePagedSearch = <Item,>(search: (query: string, offset: number) => Promise<FoundPage<Item>>, query: string): PagedSearch<Item> => {
  const [found, setFound] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const latest = useRef(query)
  latest.current = query

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      void search(query, 0).then(
        (page) => {
          if (latest.current !== query) return
          setFound(page.items)
          setTotal(page.total)
          setLoading(false)
        },
        () => {
          if (latest.current !== query) return
          setFound([])
          setTotal(0)
          setLoading(false)
        },
      )
    }, 200)
    return () => clearTimeout(timer)
  }, [search, query])

  const more = async () => {
    const asked = query
    setLoading(true)
    const page = await search(asked, found.length).catch(() => undefined)
    if (latest.current !== asked) return
    if (page) {
      setFound((shown) => [...shown, ...page.items])
      setTotal(page.total)
    }
    setLoading(false)
  }

  return { found, total, more, loading }
}
