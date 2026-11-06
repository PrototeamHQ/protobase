import { PlugZap } from 'lucide-react'
import { useState } from 'react'
import { AuthError, type WorkflowConnection } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { formatDate } from '../format'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { AccountSection, SectionError } from './account-section'

export type ConnectionsSectionProps = {
  connections: WorkflowConnection[]
  /** Leaves for the provider to connect an account; rejects with `AuthError`, which the section shows. */
  onConnect: (connection: WorkflowConnection) => Promise<void>
  /** Rejects with `AuthError`, which the section shows. */
  onDisconnect: (accountId: string) => Promise<void>
  /** Why the last connect did not go through, as the provider came back with it. */
  error?: string
}

type Chosen = { connection: WorkflowConnection; accountId: string }

// Revoking at Google ends every grant the account gave this app, the sign-in and a linked mailbox included.
const wholeGrant = (connection: WorkflowConnection) => connection.provider === 'google'

/**
 * The accounts the person connected for their workflows' steps to use, by the connection the app's plugins declare:
 * each one connects an account, again when a trigger waits for it, and disconnects one, which revokes its token.
 */
export const ConnectionsSection = ({ connections, onConnect, onDisconnect, error: returned }: ConnectionsSectionProps) => {
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState(returned)
  const [chosen, setChosen] = useState<Chosen>()

  const attempt = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    setError(undefined)
    try {
      await work()
      setChosen(undefined)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(undefined)
  }

  return (
    <AccountSection title="Connections" description="Accounts at other services that your workflows sign in with. A workflow uses one only once you turn it on yourself.">
      <SectionError message={chosen ? undefined : error} />
      <ul className="divide-y rounded-md border">
        {connections.map((connection) => (
          <li key={connection.key} className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <PlugZap className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{connection.label}</span>
              <Button size="sm" loading={busy === connection.key} disabled={busy !== undefined} onClick={() => void attempt(connection.key, () => onConnect(connection))}>
                {connection.accounts.length > 0 ? `Connect ${connection.label} again` : `Connect ${connection.label}`}
              </Button>
            </div>
            {connection.accounts.map((account) => (
              <div key={account.id} className="flex flex-wrap items-center gap-3 pl-7 text-sm">
                <span className="min-w-0 flex-1 text-muted-foreground">
                  Connected {formatDate(Date.parse(account.created_at))} · <code className="text-xs">{account.id}</code>
                </span>
                {account.needs_sign_in ? <Badge tone="amber">Connect it again</Badge> : <Badge tone="green">Connected</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setChosen({ connection, accountId: account.id })}>
                  Disconnect
                </Button>
              </div>
            ))}
          </li>
        ))}
      </ul>
      {chosen && (
        <Dialog
          title={`Disconnect ${chosen.connection.label}?`}
          description={`Workflows that sign in with it stop until you connect an account again.${wholeGrant(chosen.connection) ? ' Google ends everything you allowed this app at once: a mailbox linked through this account stops sending too.' : ''}`}
          onClose={() => setChosen(undefined)}
          actions={
            <>
              <Button onClick={() => setChosen(undefined)}>Cancel</Button>
              <Button variant="danger" loading={busy === chosen.accountId} onClick={() => void attempt(chosen.accountId, () => onDisconnect(chosen.accountId))}>
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
