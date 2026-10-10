import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { EmailCodeForm } from './email-code-form'

/** Signs in with the code emailed to `email`; the account's second step follows when it has one. */
export const EmailCodePage = ({ email, onBack }: { email: string; onBack: () => void }) => {
  const { signInWithCode, sendSignInCode } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const attempt = async (step: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      await step()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  return (
    <EmailCodeForm
      email={email}
      busy={busy}
      error={error}
      notice={notice}
      onBack={onBack}
      onSubmit={(code) => void attempt(() => signInWithCode(email, code))}
      onResend={() => void attempt(async () => {
        await sendSignInCode(email)
        setNotice('A new code is on its way. Only the newest one works.')
      })}
    />
  )
}
