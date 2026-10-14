import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { SignUpDetailsForm } from './sign-up-details-form'
import { SignUpEmailForm } from './sign-up-email-form'

/**
 * Makes an account on a server with open sign-up: the address, then the code emailed to it with the person's name and
 * password. The new account is signed in, and sets up what the sign-in policy requires as after any sign-in.
 */
export const SignUpPage = ({ workspace }: { workspace?: string }) => {
  const { signInMethods, sendSignUpCode, signUp, showSignIn, browse } = useAuth()
  const [email, setEmail] = useState<string>()
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
        onSignIn={showSignIn}
        onBrowse={browse}
        onSubmit={(address) => void attempt(async () => {
          await sendSignUpCode(address)
          setEmail(address)
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
      onBack={() => {
        setError(undefined)
        setEmail(undefined)
      }}
      onResend={() => void attempt(async () => {
        await sendSignUpCode(email)
        setNotice('A new code is on its way. Only the newest one works.')
      })}
      onSubmit={(details) => void attempt(() => signUp({ email, ...details }))}
    />
  )
}
