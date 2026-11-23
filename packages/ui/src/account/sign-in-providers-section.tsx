import { Link2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import type { SignInProvider } from '../auth/auth-provider'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { AccountSection, SectionError } from './account-section'
import { text } from './messages'

export type SignInProvidersSectionProps = {
  /** The sign-in providers the app offers. */
  providers: SignInProvider[]
  /** The ids of those the account is linked to. */
  linked: string[]
  /** Leaves for the provider to link it; rejects with `AuthError` when the server refuses to start. */
  onConnect: (provider: string) => Promise<void>
  /** Why the last link did not go through, as the provider came back with it. */
  error?: string
  /** Whether a linked provider also offers to connect it again, as a mailbox whose link stopped working needs. */
  reconnect?: boolean
  /** Linked providers whose link no longer works, as a mailbox's provider may answer: their row reads Not connected. */
  notConnected?: string[]
  /** Providers a card in `children` connects, so their row offers no button of its own. */
  connectElsewhere?: string[]
  /** A line under a provider's name, by id, such as why a sign-in through it does not count as a mailbox. */
  notes?: Record<string, string>
  /** The section's title and description; default those of connected sign-in accounts. */
  title?: string
  description?: string
  /** More of the section, under the providers, such as a mailbox's From addresses. */
  children?: ReactNode
}

/** The providers someone can sign in with besides a password, and a way to connect one whatever address it has. */
export const SignInProvidersSection = ({ providers, linked, onConnect, error: returned, reconnect = false, notConnected = [], connectElsewhere = [], notes = {}, title = text('connectedAccounts'), description = text('connectedAccountsDescription'), children }: SignInProvidersSectionProps) => {
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState(returned)

  const connect = async (provider: string) => {
    setBusy(provider)
    setError(undefined)
    try {
      await onConnect(provider)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
      setBusy(undefined)
    }
  }

  return (
    <AccountSection title={title} description={description}>
      <SectionError message={error} />
      <ul className="divide-y rounded-md border">
        {providers.map((provider) => {
          const connected = linked.includes(provider.id) && !notConnected.includes(provider.id)
          return (
          <li key={provider.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{provider.name}</span>
              {notes[provider.id] && <span className="block text-muted-foreground">{notes[provider.id]}</span>}
            </span>
            {connected && <Badge tone="green">{text('connected')}</Badge>}
            {notConnected.includes(provider.id) && <Badge tone="amber">{text('notConnected')}</Badge>}
            {(!connected || reconnect) && !connectElsewhere.includes(provider.id) && (
              <Button size="sm" loading={busy === provider.id} disabled={busy !== undefined} onClick={() => void connect(provider.id)}>
                {text(connected ? 'connectAgain' : 'connect', { name: provider.name })}
              </Button>
            )}
          </li>
          )
        })}
      </ul>
      {children}
    </AccountSection>
  )
}
