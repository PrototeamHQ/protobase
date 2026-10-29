import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { RecordCall } from '@protobase/client'
import { callsChannelEvent } from '@protobase/schema/internal'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'

/**
 * A record's latest calls, the one going on first, kept current over the record's channel, on the one socket the page
 * shares for every channel it holds: the server sends the calls there whenever they change, so following a record's
 * calls opens no connection of its own on a page that holds a channel already. Read again whenever the channel joins,
 * as after a lost connection.
 */
export const useRecordCalls = (resource: string, recordKey: string) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const key = keys.recordCalls(resource, recordKey)
  const query = useQuery({ queryKey: key, queryFn: () => client.calls(resource, recordKey) })

  useEffect(() => {
    const queryKey = keys.recordCalls(resource, recordKey)
    const channel = client.channel(resource, recordKey)
    // Only the server's own message: anyone on the channel can broadcast under the same event.
    const offCalls = channel.on(callsChannelEvent, (message) => message.server && queryClient.setQueryData<RecordCall[]>(queryKey, (message.payload as { items: RecordCall[] }).items))
    const offStatus = channel.onStatus((status) => status.state === 'joined' && void queryClient.invalidateQueries({ queryKey }))
    return () => {
      offCalls()
      offStatus()
      channel.leave()
    }
  }, [client, queryClient, resource, recordKey])

  return { ...query, ongoing: query.data?.find((call) => call.ended_at === null) }
}
