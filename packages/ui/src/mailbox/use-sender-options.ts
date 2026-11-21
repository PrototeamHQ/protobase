import { useEffect, useState } from 'react'
import { AuthError, type MailSenders } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useOptionalAuth } from '../auth/auth-provider'
import { senderOptions, type SenderOption } from './sender-options'

type Reader = { owner: string; mailSenders: () => Promise<MailSenders> }

// The latest read alone, for half a minute: every mail sender field of a page shares it, and a field shown after a
// change on the account page reads again soon.
const freshMs = 30_000
let latest: { owner: string; at: number; read: Promise<SenderOption[]> } | undefined

const readOptions = ({ owner, mailSenders }: Reader) => {
  if (latest && latest.owner === owner && Date.now() - latest.at < freshMs) return latest.read
  const read = mailSenders().then(senderOptions)
  latest = { owner, at: Date.now(), read }
  // A failed read is not kept: the field that asked shows the failure, and the next one reads again.
  read.then(undefined, () => {
    if (latest?.read === read) latest = undefined
  })
  return read
}

export type SenderOptionsState = { options?: SenderOption[]; error?: string }

/**
 * The addresses the signed-in person may send from, as a mail sender field offers them: `options` undefined while
 * they are read, and with `error` when they could not be; none for a visitor or on an app without personal mail.
 */
export const useSenderOptions = (): SenderOptionsState => {
  const auth = useOptionalAuth()
  const owner = auth && auth.personalMail.length > 0 && auth.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const account = auth?.session.account
  const [state, setState] = useState<SenderOptionsState & { owner?: string }>({})
  useEffect(() => {
    if (owner === undefined || !account) return
    let current = true
    readOptions({ owner, mailSenders: account.mailSenders }).then(
      (options) => {
        if (current) setState({ owner, options })
      },
      (failure: unknown) => {
        if (!(failure instanceof AuthError)) throw failure
        if (current) setState({ owner, error: authMessage(failure) })
      },
    )
    return () => {
      current = false
    }
  }, [owner, account])
  if (owner === undefined) return { options: [] }
  return state.owner === owner ? state : {}
}
