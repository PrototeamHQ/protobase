import { guarded } from '../lib/guarded'

const storageKey = 'protobase:page-places'
/** The places kept, the most recent ones, so the storage stays small however long the tab is used. */
const kept = 50

const isPlace = (value: unknown): value is [string, number] =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number' && Number.isFinite(value[1]) && value[1] >= 0

const read = (storage: Pick<Storage, 'getItem'>): [string, number][] =>
  guarded(() => {
    const raw = storage.getItem(storageKey)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPlace) : []
  }, [])

/**
 * How far down the document was scrolled in each history entry of a tab, by the entry's id, kept in `storage` (the
 * tab's session storage) when `persist` is called, so they outlast a reload of the page. An entry never left yet, as
 * one a link just made, starts at the top.
 */
export const createPagePlaces = (storage: Pick<Storage, 'getItem' | 'setItem'>) => {
  // The most recent last
  const places = new Map(read(storage))

  const placeOf = (entry: string) => places.get(entry) ?? 0

  const save = (entry: string, top: number) => {
    places.delete(entry)
    places.set(entry, Math.max(0, Math.round(top)))
    for (const oldest of [...places.keys()].slice(0, Math.max(0, places.size - kept))) places.delete(oldest)
  }

  const persist = () => guarded(() => storage.setItem(storageKey, JSON.stringify([...places])), undefined)

  return { placeOf, save, persist }
}

export type PagePlaces = ReturnType<typeof createPagePlaces>
