import { useEffect } from 'react'
import { useRelay } from './relay-context'

/**
 * Says the page shows the channel while it is drawn, so only that channel's notices read the page's data again (see
 * `RelayStore.shows`), and joins it when the ticket did not list it, such as a conversation the reader joined since.
 */
export const useViewChannel = (channel: string) => {
  const context = useRelay()
  useEffect(() => {
    if (!context) return
    const unview = context.store.view(channel)
    const leave = context.relay.join(channel)
    return () => {
      unview()
      leave()
    }
  }, [context, channel])
}
