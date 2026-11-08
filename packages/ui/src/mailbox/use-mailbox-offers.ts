import { useEffect, useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useOptionalAuth } from '../auth/auth-provider'
import { mailboxOffers, type LinkedAccounts, type MailboxOffer } from './mailbox-offers'
import type { MailboxProblem } from './mailbox-problem'

/**
 * The mailboxes to offer the signed-in person for `problem`, or, with `check`, before a send while none is linked:
 * `undefined` while their linked accounts are read, none in an app without personal mail. `error` says why they could
 * not be read; `connect` leaves to link one, coming back to this page.
 */
export const useMailboxOffers = (problem: MailboxProblem | undefined, check: boolean) => {
  const auth = useOptionalAuth()
  const links = auth?.personalMail ?? []
  const wanted = auth !== null && links.length > 0 && (check || problem !== undefined)
  const [linked, setLinked] = useState<LinkedAccounts>()
  const [error, setError] = useState<string>()
  const account = auth?.session.account

  useEffect(() => {
    if (!wanted || !account) return
    let shown = true
    Promise.all([account.linkedPersonalMail(links), account.linkedProviders()]).then(
      ([mail, providers]) => {
        if (shown) setLinked({ mail, providers })
      },
      (failure: unknown) => {
        if (!(failure instanceof AuthError)) throw failure
        if (shown) setError(authMessage(failure))
      },
    )
    return () => {
      shown = false
    }
  }, [wanted, account, links])

  const connect = (offer: MailboxOffer) => auth!.linkPersonalMail(offer.link)
  if (!wanted) return { offers: [] as MailboxOffer[], connect }
  if (error) return { offers: [] as MailboxOffer[], error, connect }
  return { offers: linked && mailboxOffers(links, linked, problem), connect }
}
