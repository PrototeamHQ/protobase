import { useCallback, useState } from 'react'
import type { PersonalMailLink } from '@protobase/client'
import { providerMessage } from '../../auth/auth-messages'
import { useAuth } from '../../auth/auth-provider'
import { SignInProvidersSection } from '../sign-in-providers-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { takeLinkError } from './connected-accounts-block'
import { useAccountData } from './use-account-data'

const Mailboxes = ({ links }: { links: PersonalMailLink[] }) => {
  const { session, linkPersonalMail } = useAuth()
  const { account } = session
  const [linkError] = useState(takeLinkError)
  const { data: linked, error } = useAccountData(useCallback(() => account.linkedPersonalMail(links), [account, links]), text('couldNotReadMethods'))
  if (!linked) return <AccountLoading error={error} />
  const connect = (id: string) => linkPersonalMail(links.find((link) => link.id === id)!)
  return (
    <SignInProvidersSection
      title={text('mailbox')}
      description={text('mailboxDescription')}
      providers={links.map(({ id, name }) => ({ id, name }))}
      linked={linked}
      onConnect={connect}
      error={linkError && providerMessage(linkError, links.length === 1 ? links[0]!.name : text('theProvider'))}
    />
  )
}

/** The `PersonalMail` block: the mailboxes the signed-in person can link for the app to send mail from, hidden when the app has none. */
export const PersonalMailBlock = () => {
  const { personalMail } = useAuth()
  return personalMail.length > 0 ? <Mailboxes links={personalMail} /> : null
}
