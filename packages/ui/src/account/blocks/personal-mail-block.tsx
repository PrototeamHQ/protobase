import { useCallback, useState } from 'react'
import type { MailSenderVerification, PersonalMailLink } from '@protobase/client'
import { providerMessage } from '../../auth/auth-messages'
import { useAuth } from '../../auth/auth-provider'
import { providerName } from '../../auth/provider-link'
import { mailboxOffers, type LinkedAccounts } from '../../mailbox/mailbox-offers'
import { text as mailboxText } from '../../mailbox/messages'
import { forgetSenderOptions } from '../../mailbox/sender-options-read'
import { ListingNotices } from '../listing-notices'
import { placeNotices } from '../place-notices'
import { fromAddressesAnchor, MailSendersSection } from '../mail-senders-section'
import { SignInProvidersSection } from '../sign-in-providers-section'
import { useMailboxListing } from '../use-mailbox-listing'
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

// Consent comes back to the From addresses, which a connected mailbox changes.
const fromAddressesHere = () => {
  const here = new URL(window.location.href)
  here.hash = fromAddressesAnchor
  return here.href
}

const Mailboxes = ({ links }: { links: PersonalMailLink[] }) => {
  const { session, linkPersonalMail, signInProviders } = useAuth()
  const { account } = session
  const [linkError] = useState(takeLinkError)
  const load = useCallback(async () => {
    const [mail, providers, senders] = await Promise.all([account.linkedPersonalMail(links), account.linkedProviders(), account.mailSenders()])
    return { mail, providers, senders }
  }, [account, links])
  const { data, error, reload } = useAccountData(load, text('couldNotReadMethods'))
  // The listing changes the addresses the fields offer and their states, so both are read again after it.
  const refresh = useCallback(async () => {
    const listed = await account.refreshMailSenders()
    forgetSenderOptions()
    await reload()
    return listed
  }, [account, reload])
  // A verification that settled may change the address's state, so the list and the fields' options are read again.
  const settledAgain = async (verifications: MailSenderVerification[]) => {
    if (verifications.some(({ state }) => state === 'pending')) return verifications
    forgetSenderOptions()
    await reload()
    return verifications
  }
  // Before the data is read, it checks nothing; it checks once the list names a mailbox that can list its addresses.
  const { notices, ...listing } = useMailboxListing(data?.senders.connections ?? [], refresh)
  if (!data) return <AccountLoading error={error} />
  const providerNames = (id: string) => signInProviders.find((provider) => provider.id === id)?.name ?? providerName(id)
  const mailName = (id: string) => links.find((link) => link.id === id)?.name ?? id
  const connect = (id: string) => linkPersonalMail(links.find((link) => link.id === id)!, fromAddressesHere())
  const placed = placeNotices(notices)
  return (
    <SignInProvidersSection
      title={text('mailbox')}
      description={text('mailboxDescription')}
      providers={links.map(({ id, name }) => ({ id, name }))}
      linked={data.mail}
      notes={signInOnlyNotes(links, data, providerNames)}
      reconnect
      notConnected={placed.notConnected}
      connectElsewhere={placed.connectElsewhere}
      onConnect={connect}
      error={linkError && providerMessage(linkError, links.length === 1 ? links[0]!.name : text('theProvider'))}
    >
      {placed.mailbox.length > 0 && (
        <div className="mt-3">
          <ListingNotices notices={placed.mailbox} providerName={mailName} onConnect={connect} />
        </div>
      )}
      {/* Each change reads the list again, so the section shows what the server now has, such as the one default. */}
      <MailSendersSection
        senders={data.senders}
        onAdd={async (input) => {
          const added = await account.addMailSender(input)
          forgetSenderOptions()
          await reload()
          return added
        }}
        onUpdate={async (id, change) => {
          await account.updateMailSender(id, change)
          forgetSenderOptions()
          await reload()
        }}
        onRemove={async (id) => {
          await account.removeMailSender(id)
          forgetSenderOptions()
          await reload()
        }}
        onShare={async (id, shared) => {
          await (shared ? account.shareMailSender(id) : account.unshareMailSender(id))
          await reload()
        }}
        onVerify={async (id) => settledAgain(await account.verifyMailSender(id))}
        onVerifications={async (id) => settledAgain((await account.mailSenders()).senders.find((sender) => sender.id === id)?.verifications ?? [])}
        listing={listing}
        notices={placed.fromAddresses}
        onConnect={connect}
        providerName={mailName}
      />
    </SignInProvidersSection>
  )
}

/** The `PersonalMail` block: the mailboxes the signed-in person can link for the app to send mail from, hidden when the app has none. */
export const PersonalMailBlock = () => {
  const { personalMail } = useAuth()
  return personalMail.length > 0 ? <Mailboxes links={personalMail} /> : null
}
