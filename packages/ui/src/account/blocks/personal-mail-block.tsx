import { useCallback, useState } from 'react'
import type { PersonalMailLink } from '@protobase/client'
import { providerMessage } from '../../auth/auth-messages'
import { useAuth } from '../../auth/auth-provider'
import { providerName } from '../../auth/provider-link'
import { mailboxOffers, type LinkedAccounts } from '../../mailbox/mailbox-offers'
import { text as mailboxText } from '../../mailbox/messages'
import { MailSendersSection } from '../mail-senders-section'
import { SignInProvidersSection } from '../sign-in-providers-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { takeLinkError } from './connected-accounts-block'
import { useAccountData } from './use-account-data'

// A mailbox not linked whose sign-in provider is, such as Gmail beside a Google sign-in: that sign-in cannot send mail.
const signInOnlyNotes = (links: PersonalMailLink[], linked: LinkedAccounts, providerNames: (id: string) => string) =>
  Object.fromEntries(
    mailboxOffers(links, linked, { code: 'not_linked' })
      .filter((offer) => offer.signInOnly)
      .map(({ link }) => [link.id, mailboxText('signInOnly', { provider: providerNames(link.provider), name: link.name })]),
  )

const Mailboxes = ({ links }: { links: PersonalMailLink[] }) => {
  const { session, linkPersonalMail, signInProviders } = useAuth()
  const { account } = session
  const [linkError] = useState(takeLinkError)
  const load = useCallback(async () => {
    const [mail, providers, senders] = await Promise.all([account.linkedPersonalMail(links), account.linkedProviders(), account.mailSenders()])
    return { mail, providers, senders }
  }, [account, links])
  const { data, error, reload } = useAccountData(load, text('couldNotReadMethods'))
  if (!data) return <AccountLoading error={error} />
  const providerNames = (id: string) => signInProviders.find((provider) => provider.id === id)?.name ?? providerName(id)
  const connect = (id: string) => linkPersonalMail(links.find((link) => link.id === id)!)
  return (
    <SignInProvidersSection
      title={text('mailbox')}
      description={text('mailboxDescription')}
      providers={links.map(({ id, name }) => ({ id, name }))}
      linked={data.mail}
      notes={signInOnlyNotes(links, data, providerNames)}
      reconnect
      onConnect={connect}
      error={linkError && providerMessage(linkError, links.length === 1 ? links[0]!.name : text('theProvider'))}
    >
      {/* Each change reads the list again, so the section shows what the server now has, such as the one default. */}
      <MailSendersSection
        senders={data.senders}
        onAdd={async (input) => {
          const added = await account.addMailSender(input)
          await reload()
          return added
        }}
        onUpdate={async (id, change) => {
          await account.updateMailSender(id, change)
          await reload()
        }}
        onRemove={async (id) => {
          await account.removeMailSender(id)
          await reload()
        }}
      />
    </SignInProvidersSection>
  )
}

/** The `PersonalMail` block: the mailboxes the signed-in person can link for the app to send mail from, hidden when the app has none. */
export const PersonalMailBlock = () => {
  const { personalMail } = useAuth()
  return personalMail.length > 0 ? <Mailboxes links={personalMail} /> : null
}
