import { useCallback, useEffect } from 'react'
import { guarded } from '../lib/guarded'
import { createListPlaces, type ListPlace, type ListPlaces } from './list-places'
import { useRouter } from './router'

const noStorage = { getItem: () => null, setItem: () => {} }

/** The places of this tab's lists, read from its session storage on first use. */
let places: ListPlaces | undefined
const tabPlaces = () => (places ??= createListPlaces(guarded(() => window.sessionStorage, undefined) ?? noStorage))

/**
 * Where a list starts and how it remembers where it is, so going back to it, or following a link to it, shows the same
 * records at the same height. After a change of sort or filter, a list of another URL, it starts at the top. The places
 * are stored when the list goes and when the page is hidden or left, so a reload or a discarded tab keeps them.
 */
export const useListScroll = () => {
  const { entry, path, params } = useRouter()
  const url = `${path}?${params.toString()}`
  const tab = tabPlaces()
  useEffect(() => {
    const persist = () => tab.persist()
    const hidden = () => document.visibilityState === 'hidden' && tab.persist()
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', hidden)
      tab.persist()
    }
  }, [tab])
  const remember = useCallback((place: ListPlace) => tab.save(entry, url, place), [tab, entry, url])
  return { initialIndex: tab.placeOf(entry, url), remember }
}
