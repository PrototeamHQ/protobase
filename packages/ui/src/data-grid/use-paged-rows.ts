import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GridRow } from './column-spec'
import { createPageCache, pagesForRange } from './page-cache'
import type { RowSource } from './row-source'

export const gridPageSize = 40

type Loading = { total: number; rowAt?: (index: number) => GridRow; loadRows?: RowSource['loadRows']; latencyMs: number }

/**
 * Serves rows by absolute index. Mock sources compute rows (after `latencyMs`, or at once when 0);
 * live sources load pages through `loadRows`. Unloaded rows read as undefined, so fast scrolling shows skeletons.
 */
export const usePagedRows = ({ total, rowAt, loadRows, latencyMs }: Loading, start: number, end: number) => {
  const cache = useMemo(() => createPageCache<GridRow>(gridPageSize, 60), [rowAt, loadRows])
  const [version, setVersion] = useState(0)
  const firstPage = Math.floor(start / gridPageSize)
  const lastPage = Math.floor(end / gridPageSize)
  const synchronous = !loadRows && latencyMs === 0

  useEffect(() => {
    if (synchronous) return
    const pages = pagesForRange(firstPage * gridPageSize, lastPage * gridPageSize, gridPageSize).filter((page) => !cache.hasPage(page))
    const length = (page: number) => Math.max(0, Math.min(gridPageSize, total - page * gridPageSize))
    const store = (page: number, rows: GridRow[]) => {
      cache.setPage(page, rows)
      setVersion((current) => current + 1)
    }
    if (loadRows) {
      let cancelled = false
      for (const page of pages) {
        void loadRows(page * gridPageSize, length(page)).then((rows) => {
          if (!cancelled) store(page, rows)
        })
      }
      return () => {
        cancelled = true
      }
    }
    const timers = pages.map((page) =>
      setTimeout(() => store(page, Array.from({ length: length(page) }, (_, offset) => rowAt!(page * gridPageSize + offset))), latencyMs),
    )
    return () => timers.forEach(clearTimeout)
  }, [cache, firstPage, lastPage, latencyMs, total, rowAt, loadRows, synchronous])

  return useCallback((index: number) => (synchronous ? rowAt!(index) : cache.get(index)), [cache, synchronous, rowAt, version])
}
