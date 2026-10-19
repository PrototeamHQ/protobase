import { useEffect, useRef, useState } from 'react'
import type { Organization, OrganizationsClient } from '@protobase/client'

/**
 * Every organization, 20 at a time, narrowed by `query` (searched 200 ms after the text stops changing). `more` adds the
 * next page. A page that arrives after the text changed is dropped, so it never adds rows of the old filter.
 */
export const useAllOrganizations = (client: OrganizationsClient, query: string) => {
  const [found, setFound] = useState<Organization[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const latest = useRef(query)
  latest.current = query

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true)
      void client.search(query).then(
        (page) => {
          if (latest.current !== query) return
          setFound(page.organizations)
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
  }, [client, query])

  const more = async () => {
    const asked = query
    setLoading(true)
    const page = await client.search(asked, found.length).catch(() => undefined)
    if (latest.current !== asked) return
    if (page) {
      setFound((shown) => [...shown, ...page.organizations])
      setTotal(page.total)
    }
    setLoading(false)
  }

  return { found, total, more, loading }
}
