import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { useAuth } from './auth-provider'
import { SignInForm, type SignInFormProps } from './sign-in-form'

/** Better Auth's messages, in words for the person at the keyboard. */
export const signInMessage = (error: AuthError) => {
  if (error.status === 429) return 'Too many attempts. Wait a minute and try again.'
  if (error.status === 401 || error.code === 'INVALID_EMAIL_OR_PASSWORD') return 'The email or password is not right.'
  return error.message
}

export type SignInPageProps = Pick<SignInFormProps, 'workspace' | 'notice' | 'onForgotPassword'>

export const SignInPage = ({ workspace, notice, onForgotPassword }: SignInPageProps) => {
  const { signIn, signInSocial, socialProviders } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const attempt = async (start: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await start()
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(signInMessage(failure))
      setBusy(false)
    }
  }

  return (
    <SignInForm
      busy={busy}
      error={error}
      workspace={workspace}
      notice={notice}
      onForgotPassword={onForgotPassword}
      onContinueWithGitHub={socialProviders.includes('github') ? () => void attempt(() => signInSocial('github')) : undefined}
      onSubmit={(email, password) => void attempt(() => signIn(email, password))}
    />
  )
}
