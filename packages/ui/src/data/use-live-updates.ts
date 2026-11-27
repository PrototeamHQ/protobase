import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useMemo } from 'react'
import { useRelay } from '../relay/relay-context'
import { FocusRefreshContext } from './focus-refresh'
import { liveRefresh } from './live-refresh'
import { useFollowLive } from './use-follow-live'
import type { MetaData } from './meta-data'
import { sourceStatusOf } from './with-sources'

/**
 * Keeps what the page shows of the app's `.live()` resources current: hears which records change and reads again the
 * lists, records and counts of their resources. With the app's realtime relay, the resources it notices are heard of
 * from it, only those of the channel an open conversation shows while one is open, and all of them read again once
 * after it reconnects or joins a channel the person was added to, such as a new direct message; the others over live
 * queries on the relay, or from `client.live` without it (`useFollowLive`). One live from others (`.live({ reads })`)
 * is read again on a poll with the relay, whose live queries follow tables only.
 */
export const useLiveUpdates = (meta: MetaData) => {
  const followLive = useFollowLive()
  const relay = useRelay()
  const queryClient = useQueryClient()
  const focusRefresh = useContext(FocusRefreshContext)
  const noticed = useMemo(() => (relay ? new Set(meta.relay?.resources ?? []) : new Set<string>()), [relay, meta.relay])
  const followed = useMemo(() => Object.values(meta.resources).filter((model) => model.live && !noticed.has(model.name) && !sourceStatusOf(meta, model.name)), [meta, noticed])
  const live = useMemo(() => followed.filter((model) => !model.liveReads).map((model) => model.name).sort().join(','), [followed])
  const polled = useMemo(() => followed.filter((model) => model.liveReads).map((model) => model.name).sort().join(','), [followed])

  useEffect(() => {
    if (!relay || noticed.size === 0) return
    const refresh = liveRefresh(queryClient, () => focusRefresh?.paused() ?? false)
    const stopNotices = relay.store.onNotice((notice) => relay.store.shows(notice) && refresh.changed([notice.resource]))
    const stopResync = relay.store.onResync(() => refresh.changed(noticed))
    const stopJoined = relay.store.onJoined(() => refresh.changed(noticed))
    return () => {
      stopNotices()
      stopResync()
      stopJoined()
      refresh.stop()
    }
  }, [relay, noticed, queryClient, focusRefresh])

  useEffect(() => {
    if (!live && !polled) return
    const resources = live ? live.split(',') : []
    const others = polled ? polled.split(',') : []
    const refresh = liveRefresh(queryClient, () => focusRefresh?.paused() ?? false)
    const stop = followLive({ resources, polled: others, onChanges: (changes) => refresh.changed(changes.map((change) => change.resource)), onResync: () => refresh.changed([...resources, ...others]) })
    return () => {
      stop()
      refresh.stop()
    }
  }, [followLive, queryClient, focusRefresh, live, polled])
}
