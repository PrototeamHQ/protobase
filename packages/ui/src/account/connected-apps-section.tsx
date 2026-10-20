import { Bot } from 'lucide-react'
import { useState } from 'react'
import { AuthError, type ConnectedApp } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { clientName } from '../connect/client-name'
import { clientPublisher } from '../connect/client-publisher'
import { formatDate } from '../format'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { AccountSection, SectionError } from './account-section'

export type ConnectedAppsSectionProps = {
  apps: ConnectedApp[]
  /** Rejects with `AuthError`, which the section shows. */
  onDisconnect: (clientId: string) => Promise<void>
}

const nameOf = (app: ConnectedApp) => clientName(app.name) ?? 'An unnamed app'

// "as Sales in Acme", one per role and organization it was allowed with.
const accessOf = (app: ConnectedApp) =>
  app.access.map(({ role, organization }) => `as ${role || 'no role'}${organization ? ` in ${organization}` : ''}`).join(', ')

/** The apps, such as MCP clients, the person allowed to act as them, each of which they can disconnect. */
export const ConnectedAppsSection = ({ apps, onDisconnect }: ConnectedAppsSectionProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [disconnecting, setDisconnecting] = useState<ConnectedApp>()

  const disconnect = async (app: ConnectedApp) => {
    setBusy(true)
    setError(undefined)
    try {
      await onDisconnect(app.clientId)
      setDisconnecting(undefined)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  return (
    <AccountSection title="Connected apps" description="AI assistants and other apps you allowed to act as you here. Disconnecting one stops it within 15 minutes; it has to ask you again to come back.">
      <SectionError message={disconnecting ? undefined : error} />
      {apps.length === 0 ? (
        <p className="text-muted-foreground">No apps are connected. Add this app's MCP address to an AI assistant to connect one.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {apps.map((app) => {
            const publisher = clientPublisher(app.clientId)
            return (
              <li key={app.clientId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Bot className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <bdi className="block truncate font-medium">{nameOf(app)}</bdi>
                  <span className="block text-xs text-muted-foreground">
                    {publisher && `Published by ${publisher} · `}Allowed {formatDate(Date.parse(app.allowedAt))} · {accessOf(app)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setDisconnecting(app)}>
                  Disconnect
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {disconnecting && (
        <Dialog
          title={`Disconnect ${nameOf(disconnecting)}?`}
          description="It can no longer read or change anything as you. What it already started may keep working for up to 15 minutes."
          onClose={() => setDisconnecting(undefined)}
          actions={
            <>
              <Button onClick={() => setDisconnecting(undefined)}>Cancel</Button>
              <Button variant="danger" loading={busy} onClick={() => void disconnect(disconnecting)}>
                Disconnect
              </Button>
            </>
          }
        >
          {error && <SectionError message={error} />}
        </Dialog>
      )}
    </AccountSection>
  )
}
