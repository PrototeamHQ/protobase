import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useMemo } from 'react'
import { useClient } from './api-provider'
import { FocusRefreshContext } from './focus-refresh'
import { liveRefresh } from './live-refresh'
import type { MetaData } from './meta-data'
import { sourceStatusOf } from './with-sources'

/**
 * Keeps what the page shows of the app's `.live()` resources current: hears which records change (`client.live`) and
 * reads again the lists, records and counts of their resources. Connects only when the caller reads a live resource.
 */
export const useLiveUpdates = (meta: MetaData) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const focusRefresh = useContext(FocusRefreshContext)
  const live = useMemo(() => Object.values(meta.resources).filter((model) => model.live && !sourceStatusOf(meta, model.name)).map((model) => model.name).sort().join(','), [meta])
  useEffect(() => {
    if (!live) return
    const refresh = liveRefresh(queryClient, () => focusRefresh?.paused() ?? false)
    const stop = client.live({ onChanges: (changes) => refresh.changed(changes.map((change) => change.resource)), onResync: () => refresh.changed(live.split(',')) })
    return () => {
      stop()
      refresh.stop()
    }
  }, [client, queryClient, focusRefresh, live])
}
