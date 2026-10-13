import { useCallback } from 'react'
import { useRouter } from './router'

/** The first record in view of the list each history entry last showed, for this tab; a page load starts empty. */
const remembered = new Map<number, { url: string; index: number }>()

/**
 * Where a list starts and how it remembers where it is, so going back to it shows the same records. Only the list the
 * history entry showed last comes back: after a change of sort or filter, which replaces the entry, the list starts at
 * the top again.
 */
export const useListScroll = () => {
  const { entry, path, params } = useRouter()
  const url = `${path}?${params.toString()}`
  const last = remembered.get(entry)
  const remember = useCallback((index: number) => void remembered.set(entry, { url, index }), [entry, url])
  return { initialIndex: last?.url === url ? last.index : 0, remember }
}
