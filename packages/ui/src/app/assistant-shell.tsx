import { Sparkles } from 'lucide-react'
import type { AssistantClient } from '@protobase/client'
import { AssistantDock, useAssistant, useAssistantClient } from '../assistant-dock'
import { Button } from '../primitives/button'

export const AssistantButton = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <Button size="sm" variant={open ? 'primary' : 'secondary'} aria-pressed={open} onClick={onToggle}>
    <Sparkles className="size-3.5" />
    Assistant
  </Button>
)

const ConnectedDock = ({ client, onClose }: { client: AssistantClient | undefined; onClose: () => void }) => {
  const { state, offline, error, send, act } = useAssistant(client)
  return <AssistantDock state={state} offline={offline} error={error} onSend={send} onAction={act} onClose={onClose} />
}

const OwnDock = ({ url, onClose }: { url: string; onClose: () => void }) => <ConnectedDock client={useAssistantClient(url)} onClose={onClose} />

/** The dock for the backend `/meta` names, signed in as the user; `client` replaces it in stories and tests. */
export const AssistantPanel = ({ url, client, onClose }: { url: string; client?: AssistantClient; onClose: () => void }) =>
  client ? <ConnectedDock client={client} onClose={onClose} /> : <OwnDock url={url} onClose={onClose} />
