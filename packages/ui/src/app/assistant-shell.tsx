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

type DockProps = { page: string; onClose: () => void }

const ConnectedDock = ({ client, page, onClose }: DockProps & { client: AssistantClient | undefined }) => {
  const { state, offline, error, send, act } = useAssistant(client)
  return <AssistantDock state={state} offline={offline} error={error} onSend={(text) => send(text, page)} onAction={act} onClose={onClose} />
}

const OwnDock = ({ url, ...props }: DockProps & { url: string }) => <ConnectedDock client={useAssistantClient(url)} {...props} />

/**
 * The dock for the backend `/meta` names, signed in as the user, sending each message with the `page` the user is on;
 * `client` replaces it in stories and tests.
 */
export const AssistantPanel = ({ url, client, ...props }: DockProps & { url: string; client?: AssistantClient }) =>
  client ? <ConnectedDock client={client} {...props} /> : <OwnDock url={url} {...props} />
