import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { SignUpDetailsForm } from './sign-up-details-form'
import { SignUpEmailForm } from './sign-up-email-form'

export type SignUpPageProps = {
  workspace?: string
  /** The address the code went to: the step that makes the account. Without it, the step that asks for the address. */
  email?: string
  /** A code was emailed to `email`: the step that makes the account is next. */
  onCodeSent: (email: string) => void
  /** From the step that makes the account back to the one that asks for the address. */
  onBack: () => void
  onSignIn: () => void
  /** Back to browsing, when the server lets visitors browse without signing in. */
  onBrowse?: () => void
}

/**
 * Makes an account on a server with open sign-up: the address, then the code emailed to it with the person's name and
 * password. The new account is signed in, and sets up what the sign-in policy requires as after any sign-in.
 */
export const SignUpPage = ({ workspace, email, onCodeSent, onBack, onSignIn, onBrowse }: SignUpPageProps) => {
  const { signInMethods, sendSignUpCode, signUp } = useAuth()
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

  if (email === undefined) {
    return (
      <SignUpEmailForm
        workspace={workspace}
        busy={busy}
        error={error}
        onSignIn={onSignIn}
        onBrowse={onBrowse}
        onSubmit={(address) => void attempt(async () => {
          await sendSignUpCode(address)
          onCodeSent(address)
        })}
      />
    )
  }
  return (
    <SignUpDetailsForm
      email={email}
      methods={signInMethods}
      busy={busy}
      error={error}
      notice={notice}
      onBack={onBack}
      onResend={() => void attempt(async () => {
        await sendSignUpCode(email)
        setNotice('A new code is on its way. Only the newest one works.')
      })}
      onSubmit={(details) => void attempt(() => signUp({ email, ...details }))}
    />
  )
}
