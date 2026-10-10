import { Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { AssistantClient } from '@protobase/client'
import type { AssistantState } from '@protobase/schema'
import { ChatMessage, ChatThread, Composer } from '../chat'
import { SidePanel } from '../side-panel'
import { PartView } from './part-view'
import { AssistantBackendContext } from './use-backend-data'

export type AssistantDockProps = {
  state: AssistantState
  /** The connection to the backend is down and being retried. */
  offline?: boolean
  /** Why the last message or click was not delivered. */
  error?: string
  onSend?: (text: string) => void
  onAction?: (partId: string, actionId: string) => void
  onClose?: () => void
  /** The backend's client, which widgets read and post through with `useBackendData`. */
  client?: AssistantClient
}

const defaultPlaceholder = 'Ask a question...'

/**
 * The assistant beside the app: renders a backend's chat, its cards, the app's widgets and status line, and sends
 * messages and clicks back.
 */
export const AssistantDock = ({ state, offline, error, onSend, onAction, onClose, client }: AssistantDockProps) => {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (state.placeholder) input.current?.focus()
  }, [state.placeholder])

  return (
    <SidePanel
      title="Assistant"
      icon={<Sparkles className="size-4 text-primary" />}
      status={offline ? 'Reconnecting...' : state.status}
      onClose={onClose}
      footer={
        <>
          {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
          <Composer inputRef={input} onSend={onSend} busy={state.replying} placeholder={state.placeholder ?? defaultPlaceholder} />
        </>
      }
    >
      <AssistantBackendContext.Provider value={client}>
        <ChatThread length={state.messages.reduce((sum, message) => sum + message.parts.length, 0)} empty="Ask a question about this app or its data.">
          {state.messages.map((message) => (
            <ChatMessage key={message.id} from={message.from}>
              {message.parts.map((part) => <PartView key={part.id} part={part} onAction={onAction} />)}
            </ChatMessage>
          ))}
        </ChatThread>
      </AssistantBackendContext.Provider>
    </SidePanel>
  )
}
