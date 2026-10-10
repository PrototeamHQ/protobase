import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage, signInMessage } from './auth-messages'
import { useAuth } from './auth-provider'
import { SignInForm, type SignInFormProps } from './sign-in-form'

export { signInMessage }

export type SignInPageProps = Pick<SignInFormProps, 'workspace' | 'notice' | 'onForgotPassword'> & {
  /** A sign-in code was emailed to `email`: the page for entering it is next. */
  onCodeSent: (email: string) => void
}

export const SignInPage = ({ workspace, notice, onForgotPassword, onCodeSent }: SignInPageProps) => {
  const { signIn, signInSocial, socialProviders, signInMethods, sendSignInCode, signInWithPasskey } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

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
      onContinueWithGitHub={socialProviders.includes('github') ? () => void attempt(() => signInSocial('github'), signInMessage) : undefined}
      onPasskey={() => void attempt(signInWithPasskey, authMessage)}
      onSendCode={(email) => void attempt(async () => {
        await sendSignInCode(email)
        onCodeSent(email)
      }, authMessage)}
      onSubmit={(email, password) => void attempt(() => signIn(email, password), signInMessage)}
    />
  )
}
