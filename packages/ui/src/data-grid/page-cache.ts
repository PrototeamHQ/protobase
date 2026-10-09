export type PageCache<T> = {
  get: (index: number) => T | undefined
  hasPage: (page: number) => boolean
  setPage: (page: number, rows: T[]) => void
  readonly size: number
}

/** Holds fixed-size pages of rows; evicts the oldest pages beyond `maxPages`. */
export const createPageCache = <T>(pageSize: number, maxPages: number): PageCache<T> => {
  const pages = new Map<number, T[]>()
  return {
    get: (index) => pages.get(Math.floor(index / pageSize))?.[index % pageSize],
    hasPage: (page) => pages.has(page),
    setPage: (page, rows) => {
      pages.delete(page)
      pages.set(page, rows)
      if (pages.size <= maxPages) return
      const oldest = pages.keys().next()
      if (oldest.done) return
      pages.delete(oldest.value)
    },
    get size() {
      return pages.size
    },
  }
}

export const pagesForRange = (start: number, end: number, pageSize: number) => {
  const first = Math.floor(start / pageSize)
  const last = Math.floor(end / pageSize)
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset)
}
