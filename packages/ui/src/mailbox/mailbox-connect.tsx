import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { ActionCard } from '../action-card/action-card'
import { authMessage } from '../auth/auth-messages'
import { useOptionalAuth } from '../auth/auth-provider'
import { providerName } from '../auth/provider-link'
import type { MailboxOffer } from './mailbox-offers'
import type { MailboxProblem } from './mailbox-problem'
import { text } from './messages'

type MailboxConnectProps = {
  offers: MailboxOffer[]
  /** Why the send failed; none when it has not run yet, as no mailbox is linked. */
  problem?: MailboxProblem
  onConnect: (offer: MailboxOffer) => Promise<void>
}

/**
 * Why mail cannot go out from the person's own mailbox, with a button to connect each mailbox the app offers: it starts
 * the same sign-in as the account page's, which comes back to this page. A sign-in through the mailbox's provider that
 * did not allow sending mail is named, so it is not taken for a mailbox.
 */
export const MailboxConnect = ({ offers, problem, onConnect }: MailboxConnectProps) => {
  const signInProviders = useOptionalAuth()?.signInProviders ?? []
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const expired = problem?.code === 'link_expired'
  const names = offers.map((offer) => offer.link.name)
  const signInName = (provider: string) => signInProviders.find((entry) => entry.id === provider)?.name ?? providerName(provider)

  const connect = async (id: string) => {
    setBusy(true)
    setError(undefined)
    try {
      await onConnect(offers.find((offer) => offer.link.id === id)!)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
      setBusy(false)
    }
  }

  return (
    <ActionCard
      title={text(expired ? 'expiredTitle' : 'missingTitle')}
      tone="warning"
      actions={offers.map(({ link, again }) => ({ id: link.id, label: text(again ? 'connectAgain' : 'connect', { name: link.name }), style: 'primary', disabled: busy }))}
      onAction={(id) => void connect(id)}
    >
      <div className="space-y-1 text-body">
        <p>{text(expired ? 'expired' : 'missing', { names: names.join(', ') })}</p>
        {offers
          .filter((offer) => offer.signInOnly)
          .map(({ link }) => (
            <p key={link.id}>{text('signInOnly', { provider: signInName(link.provider), name: link.name })}</p>
          ))}
        {error && (
          <p role="alert" className="font-medium text-danger-text">
            {error}
          </p>
        )}
      </div>
    </ActionCard>
  )
}
