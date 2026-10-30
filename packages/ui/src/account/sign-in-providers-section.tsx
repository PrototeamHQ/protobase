import { Link2 } from 'lucide-react'
import { useState } from 'react'
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
  /** The section's title and description; default those of connected sign-in accounts. */
  title?: string
  description?: string
}

/** The providers someone can sign in with besides a password, and a way to connect one whatever address it has. */
export const SignInProvidersSection = ({ providers, linked, onConnect, error: returned, title = text('connectedAccounts'), description = text('connectedAccountsDescription') }: SignInProvidersSectionProps) => {
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
        {providers.map((provider) => (
          <li key={provider.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{provider.name}</span>
            {linked.includes(provider.id) ? (
              <Badge tone="green">{text('connected')}</Badge>
            ) : (
              <Button size="sm" loading={busy === provider.id} disabled={busy !== undefined} onClick={() => void connect(provider.id)}>
                {text('connect', provider.name)}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </AccountSection>
  )
}
