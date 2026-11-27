import { useCallback, useContext } from 'react'
import type { RelayLiveHandlers } from '@protobase/client'
import { useClient } from './api-provider'
import { MetaContext } from './meta-context'

/**
 * How the page hears of live changes: over live queries on the relay's socket in an app with the relay, which serves
 * no live stream, else over the live stream (`client.live`), which hears of every live resource and needs no list.
 */
export const useFollowLive = () => {
  const client = useClient()
  const relayed = Boolean(useContext(MetaContext)?.relay)
  return useCallback((handlers: RelayLiveHandlers) => (relayed ? client.relay.live(handlers) : client.live(handlers)), [client, relayed])
}
