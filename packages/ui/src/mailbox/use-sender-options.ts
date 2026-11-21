import { useCallback, useEffect, useState } from 'react'
import { AuthError, NetworkError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { useOptionalAuth } from '../auth/auth-provider'
import { text } from './messages'
import type { SenderOption } from './sender-options'
import { onForgetSenderOptions, readSenderOptions } from './sender-options-read'

export type SenderOptionsState = { options?: SenderOption[]; error?: string; retry?: () => void }

/**
 * The addresses the signed-in person may send from, as a mail sender field offers them: `options` undefined while
 * they are read, and with `error` and `retry` when they could not be; none for a visitor or on an app without personal
 * mail. They are read again when the person changes their addresses (`forgetSenderOptions`).
 */
export const useSenderOptions = (): SenderOptionsState => {
  const auth = useOptionalAuth()
  const owner = auth && auth.personalMail.length > 0 && auth.state.kind === 'signed-in' ? auth.state.user.id : undefined
  const account = auth?.session.account
  const [reads, setReads] = useState(0)
  const reread = useCallback(() => setReads((count) => count + 1), [])
  useEffect(() => onForgetSenderOptions(reread), [reread])
  const [state, setState] = useState<SenderOptionsState & { owner?: string; reads?: number }>({})
  useEffect(() => {
    if (owner === undefined || !account) return
    let current = true
    readSenderOptions({ owner, mailSenders: account.mailSenders }).then(
      (options) => {
        if (current) setState({ owner, reads, options })
      },
      (failure: unknown) => {
        if (!(failure instanceof AuthError) && !(failure instanceof NetworkError)) throw failure
        const error = failure instanceof AuthError ? authMessage(failure) : text('sendersNotRead')
        if (current) setState({ owner, reads, error, retry: reread })
      },
    )
    return () => {
      current = false
    }
  }, [owner, account, reads, reread])
  if (owner === undefined) return { options: [] }
  if (state.owner !== owner) return {}
  // While it reads again, the field keeps the addresses it has, so nothing moves; after a failure it shows it reads.
  return state.reads === reads || state.options ? state : {}
}
