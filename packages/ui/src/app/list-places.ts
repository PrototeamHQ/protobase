import { guarded } from '../lib/guarded'

/**
 * Where a list was, as the index of the first record in the row at the top of the view plus how far into that row the
 * view was, as a fraction of its height: 700.25 is a quarter into the row that starts at record 700.
 */
export type ListPlace = number

type Saved = { entry: string; url: string; place: ListPlace }

const storageKey = 'protobase:list-places'
/** The places kept, the most recent ones, so the storage stays small however long the tab is used. */
const kept = 50

const keyOf = (entry: string, url: string) => `${entry} ${url}`

const isSaved = (value: unknown): value is Saved => {
  if (typeof value !== 'object' || value === null) return false
  const { entry, url, place } = value as Record<string, unknown>
  return typeof entry === 'string' && typeof url === 'string' && typeof place === 'number' && Number.isFinite(place) && place >= 0
}

const read = (storage: Pick<Storage, 'getItem'>): Saved[] =>
  guarded(() => {
    const raw = storage.getItem(storageKey)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isSaved) : []
  }, [])

/**
 * The places of the lists of a tab, by history entry and list URL, kept in `storage` (the tab's session storage) when
 * `persist` is called, so they outlast a reload of the page. A list starts where it was in its history entry, as on
 * Back; in an entry it has no place in yet, as after a link to the same list, where it last was in any entry.
 */
export const createListPlaces = (storage: Pick<Storage, 'getItem' | 'setItem'>) => {
  // The most recent last
  const places = new Map(read(storage).map((saved) => [keyOf(saved.entry, saved.url), saved]))

  const placeOf = (entry: string, url: string): ListPlace => {
    const own = places.get(keyOf(entry, url))
    if (own) return own.place
    const latest = [...places.values()].findLast((saved) => saved.url === url)
    return latest?.place ?? 0
  }

  const save = (entry: string, url: string, place: ListPlace) => {
    const key = keyOf(entry, url)
    places.delete(key)
    places.set(key, { entry, url, place })
    for (const oldest of [...places.keys()].slice(0, Math.max(0, places.size - kept))) places.delete(oldest)
  }

  const persist = () => guarded(() => storage.setItem(storageKey, JSON.stringify([...places.values()])), undefined)

  return { placeOf, save, persist }
}

export type ListPlaces = ReturnType<typeof createListPlaces>
