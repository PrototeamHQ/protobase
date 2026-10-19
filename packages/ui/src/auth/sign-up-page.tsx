import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { SignUpCodeForm } from './sign-up-code-form'
import { SignUpDetailsForm } from './sign-up-details-form'
import { SignUpEmailForm } from './sign-up-email-form'
import { text } from './messages'

export type SignUpPageProps = {
  workspace?: string
  /** The address the code went to: the step that checks the code. Without it, the step that asks for the address. */
  email?: string
  /** What the right code for `email` was traded for: the step that asks for the name and password, and makes the account. */
  ticket?: string
  /** A code was emailed to `email`: the step that checks it is next. */
  onCodeSent: (email: string) => void
  /** The code was right: the step that makes the account with `ticket` is next. */
  onVerified: (ticket: string) => void
  /** From a later step back to the one that asks for the address. */
  onBack: () => void
  onSignIn: () => void
  /** Back to browsing, when the server lets visitors browse without signing in. */
  onBrowse?: () => void
}

/**
 * Makes an account on a server with open sign-up: the address, then the code emailed to it on its own, then the
 * person's name and password. The new account is signed in, and sets up what the sign-in policy requires as after any
 * sign-in.
 */
export const SignUpPage = ({ workspace, email, ticket, onCodeSent, onVerified, onBack, onSignIn, onBrowse }: SignUpPageProps) => {
  const { signInMethods, sendSignUpCode, verifySignUpCode, signUp } = useAuth()
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
  if (ticket === undefined) {
    return (
      <SignUpCodeForm
        email={email}
        busy={busy}
        error={error}
        notice={notice}
        onBack={onBack}
        onSubmit={(code) => void attempt(async () => onVerified(await verifySignUpCode(email, code)))}
        onResend={() => void attempt(async () => {
          await sendSignUpCode(email)
          setNotice(text('newCodeSent'))
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
      onBack={onBack}
      onSubmit={(details) => void attempt(() => signUp({ ticket, ...details }))}
    />
  )
}
