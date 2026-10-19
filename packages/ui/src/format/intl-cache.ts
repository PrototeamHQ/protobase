import { formatTag } from '../locale/active-locale'

const cache = new Map<string, unknown>()

/** One `Intl` formatter per language tag and `key`, made with `make` for the active locale's tag the first time. */
export const cachedFormat = <T>(key: string, make: (tag: string) => T): T => {
  const tag = formatTag()
  const id = `${tag}|${key}`
  if (!cache.has(id)) cache.set(id, make(tag))
  return cache.get(id) as T
}
