import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage, signInMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { SignInForm, type SignInFormProps } from './sign-in-form'

export { signInMessage }

export type SignInPageProps = Pick<SignInFormProps, 'workspace' | 'notice' | 'onForgotPassword' | 'onSignUp' | 'onBrowse'> & {
  /** A sign-in code was emailed to `email`: the page for entering it is next. */
  onCodeSent: (email: string) => void
  /** Why the last sign-in did not go through, for example the provider's refusal. */
  error?: string
}

export const SignInPage = ({ workspace, notice, onForgotPassword, onSignUp, onBrowse, onCodeSent, error: initialError }: SignInPageProps) => {
  const { signIn, signInSocial, signInProviders, signInMethods, passkeyDomains, sendSignInCode, signInWithPasskey } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)

  const attempt = async (start: () => Promise<void>, message: (error: AuthError) => string) => {
    setBusy(true)
    setError(undefined)
    try {
      await start()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(message(failure))
      setBusy(false)
    }
  }

  return (
    <SignInForm
      busy={busy}
      error={error}
      workspace={workspace}
      notice={notice}
      methods={signInMethods}
      onForgotPassword={onForgotPassword}
      onSignUp={onSignUp}
      onBrowse={onBrowse}
      providers={signInProviders}
      onContinueWith={(provider) => void attempt(() => signInSocial(provider), signInMessage)}
      passkeyDomains={passkeyDomains}
      onPasskey={(domain) => void attempt(() => signInWithPasskey(domain), authMessage)}
      onSendCode={(email) => void attempt(async () => {
        await sendSignInCode(email)
        onCodeSent(email)
      }, authMessage)}
      onSubmit={(email, password) => void attempt(() => signIn(email, password), signInMessage)}
    />
  )
}
