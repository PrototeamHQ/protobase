import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { useAuth } from './auth-provider'
import { EmailCodePage } from './email-code-page'
import { FirstRunPage } from './first-run-page'
import { ForgotPasswordPage } from './forgot-password-page'
import { readResetLink, withoutResetLink } from './reset-link'
import { ResetPasswordPage } from './reset-password-page'
import { SetupRequiredPage } from './setup-required-page'
import { SignInPage } from './sign-in-page'
import { TwoFactorPage } from './two-factor-page'

type AuthPage = { kind: 'sign-in'; notice?: string } | { kind: 'email-code'; email: string } | { kind: 'forgot-password' } | { kind: 'reset-password'; token: string | undefined }

// An emailed reset link opens the set-password page, whoever is signed in.
const firstPage = (): AuthPage => {
  const link = readResetLink(window.location.href)
  return link ? { kind: 'reset-password', token: link.token } : { kind: 'sign-in' }
}

const forgetResetLink = () => window.history.replaceState(window.history.state, '', withoutResetLink(window.location.href))

/** Shows the app when the user is signed in (or the server has no login), and the right page otherwise. */
export const AuthGate = ({ workspace, children }: { workspace?: string; children: ReactNode }) => {
  const { state, recheck, passwordReset, signOut } = useAuth()
  const [page, setPage] = useState(firstPage)
  // A notice and a sent code are for the next sign-in only: once its first step went through, signing out starts over.
  useEffect(() => {
    if (state.kind === 'signed-in' || state.kind === 'two-factor' || state.kind === 'setup-required') {
      setPage((current) => (current.kind === 'email-code' || (current.kind === 'sign-in' && current.notice) ? { kind: 'sign-in' } : current))
    }
  }, [state.kind])

  const leaveResetPage = (next: AuthPage) => {
    forgetResetLink()
    setPage(next)
  }
  // The reset ended every session, so the app forgets its own as well.
  const passwordChanged = async () => {
    if (state.kind === 'signed-in') await signOut()
    leaveResetPage({ kind: 'sign-in', notice: 'Your password is changed. Sign in with the new one.' })
  }
  const backToSignIn = () => {
    setPage({ kind: 'sign-in' })
    void signOut()
  }

  switch (state.kind) {
    case 'loading':
      return (
        <div className="flex h-full min-h-48 items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Spinner /> Loading
        </div>
      )
    case 'error':
      return (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-[13px] text-muted-foreground">Cannot reach the server: {state.message}</p>
          <Button onClick={recheck}>Try again</Button>
        </div>
      )
    case 'needs-admin':
      return <FirstRunPage onCheckAgain={recheck} />
  }
  if (page.kind === 'reset-password') {
    return (
      <ResetPasswordPage
        token={page.token}
        onDone={() => void passwordChanged()}
        onRequestNewLink={passwordReset ? () => leaveResetPage({ kind: 'forgot-password' }) : undefined}
        onBack={() => leaveResetPage({ kind: 'sign-in' })}
      />
    )
  }
  if (state.kind === 'signed-in') return children
  if (state.kind === 'two-factor') return <TwoFactorPage methods={state.methods} onBack={backToSignIn} />
  if (state.kind === 'setup-required') return <SetupRequiredPage key={state.missing.join()} missing={state.missing} />
  if (page.kind === 'forgot-password') return <ForgotPasswordPage onBack={() => setPage({ kind: 'sign-in' })} />
  if (page.kind === 'email-code') return <EmailCodePage email={page.email} onBack={() => setPage({ kind: 'sign-in' })} />
  return <SignInPage workspace={workspace} notice={page.notice} onForgotPassword={passwordReset ? () => setPage({ kind: 'forgot-password' }) : undefined} onCodeSent={(email) => setPage({ kind: 'email-code', email })} />
}
