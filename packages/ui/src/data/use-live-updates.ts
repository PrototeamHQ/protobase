import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useMemo } from 'react'
import { useRelay } from '../relay/relay-context'
import { useClient } from './api-provider'
import { FocusRefreshContext } from './focus-refresh'
import { liveRefresh } from './live-refresh'
import type { MetaData } from './meta-data'
import { sourceStatusOf } from './with-sources'

/**
 * Keeps what the page shows of the app's `.live()` resources current: hears which records change and reads again the
 * lists, records and counts of their resources. With the app's realtime relay, the resources it notices are heard of
 * from it, only those of the channel an open conversation shows while one is open, and all of them read again once
 * after it reconnects; the others from `client.live`, which connects only when
 * the caller reads such a resource.
 */
export const useLiveUpdates = (meta: MetaData) => {
  const client = useClient()
  const relay = useRelay()
  const queryClient = useQueryClient()
  const focusRefresh = useContext(FocusRefreshContext)
  const noticed = useMemo(() => (relay ? new Set(meta.relay?.resources ?? []) : new Set<string>()), [relay, meta.relay])
  const live = useMemo(() => Object.values(meta.resources).filter((model) => model.live && !noticed.has(model.name) && !sourceStatusOf(meta, model.name)).map((model) => model.name).sort().join(','), [meta, noticed])

  useEffect(() => {
    if (!relay || noticed.size === 0) return
    const refresh = liveRefresh(queryClient, () => focusRefresh?.paused() ?? false)
    const stopNotices = relay.store.onNotice((notice) => relay.store.shows(notice) && refresh.changed([notice.resource]))
    const stopResync = relay.store.onResync(() => refresh.changed(noticed))
    return () => {
      stopNotices()
      stopResync()
      refresh.stop()
    }
  }, [relay, noticed, queryClient, focusRefresh])

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
