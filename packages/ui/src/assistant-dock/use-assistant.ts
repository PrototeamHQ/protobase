import { useEffect, useState } from 'react'
import { applyAssistantEvent, emptyAssistantState } from '@protobase/schema'
import type { AssistantClient } from '@protobase/client'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The assistant did not answer')

/** Follows an assistant backend's event stream into state, with its two requests; `undefined` client means not yet. */
export const useAssistant = (client: AssistantClient | undefined) => {
  const [state, setState] = useState(emptyAssistantState)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!client) return
    return client.connect(
      (event) => setState((current) => applyAssistantEvent(current, event)),
      (connection) => setOffline(connection.state === 'retrying'),
    )
  }, [client])

  const deliver = (request: Promise<void>) => {
    setError(undefined)
    request.catch((reason: unknown) => setError(messageOf(reason)))
  }

  return {
    state,
    offline,
    error,
    send: (text: string, page?: string) => client && deliver(client.send(text, page)),
    act: (partId: string, actionId: string) => client && deliver(client.act(partId, actionId)),
  }
}
