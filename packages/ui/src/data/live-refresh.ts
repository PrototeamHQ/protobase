import type { QueryClient } from '@tanstack/react-query'

/** How long changes gather before what shows them is read again, so a burst of writes costs one refetch per query. */
export const gatherMs = 300

/**
 * Reads again what the page shows of the resources whose records changed: every query keyed by the resource, as after
 * a write of the page's own. While a form holds unsaved changes (`paused`), the records stay as they are, only marked
 * stale, so the form's Save still finds a conflict.
 */
export const liveRefresh = (queryClient: QueryClient, paused: () => boolean) => {
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    timer = undefined
    const resources = new Set(pending)
    pending.clear()
    const shown = (key: readonly unknown[]) => resources.has(key[1] as string)
    void queryClient.invalidateQueries({ predicate: (query) => shown(query.queryKey) && query.queryKey[0] !== 'record' })
    void queryClient.invalidateQueries({ predicate: (query) => shown(query.queryKey) && query.queryKey[0] === 'record', refetchType: paused() ? 'none' : 'active' })
  }

  return {
    changed: (resources: Iterable<string>) => {
      for (const resource of resources) pending.add(resource)
      if (pending.size > 0 && !timer) timer = setTimeout(flush, gatherMs)
    },
    stop: () => clearTimeout(timer),
  }
}
