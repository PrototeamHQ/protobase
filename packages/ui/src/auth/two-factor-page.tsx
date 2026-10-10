import { useState } from 'react'
import { AuthError, type TwoFactorMethod } from '@protobase/client'
import { authMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { TwoFactorForm } from './two-factor-form'

/** The second step after a password or an emailed code, with the methods the server named. */
export const TwoFactorPage = ({ methods, onBack }: { methods: TwoFactorMethod[]; onBack: () => void }) => {
  const { verifyTwoFactor, session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [codeSent, setCodeSent] = useState(false)

  const attempt = async (step: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await step()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  return (
    <TwoFactorForm
      methods={methods}
      busy={busy}
      error={error}
      codeSent={codeSent}
      onBack={onBack}
      onVerify={(input) => void attempt(() => verifyTwoFactor(input))}
      onSendCode={() => void attempt(async () => {
        await session.sendTwoFactorCode()
        setCodeSent(true)
      })}
    />
  )
}
