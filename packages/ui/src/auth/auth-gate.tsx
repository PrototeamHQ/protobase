import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { useAuth } from './auth-provider'
import { EmailCodePage } from './email-code-page'
import { providerMessage } from './auth-messages'
import { FirstRunPage } from './first-run-page'
import { ForgotPasswordPage } from './forgot-password-page'
import { readProviderError, readSignInLink, withoutSignInLink } from './provider-link'
import { ProviderSignInPage } from './provider-sign-in-page'
import { readResetLink, withoutResetLink } from './reset-link'
import { ResetPasswordPage } from './reset-password-page'
import { SetupRequiredPage } from './setup-required-page'
import { SignInPage } from './sign-in-page'
import { readStaffLink, withoutStaffLink, type StaffLink } from './staff-link'
import { StaffSignInPage } from './staff-sign-in-page'
import { TwoFactorPage } from './two-factor-page'
import { readInvitationLink, withoutInvitationLink } from '../organizations/invitation-link'
import { InvitationPage } from '../organizations/invitation-page'

type AuthPage =
  /** `error`: why the last sign-in did not go through; `providerError`: the code a provider came back with. */
  | { kind: 'sign-in'; notice?: string; error?: string; providerError?: string }
  | { kind: 'provider-sign-in'; provider: string }
  | { kind: 'email-code'; email: string }
  | { kind: 'forgot-password' }
  | { kind: 'reset-password'; token: string | undefined }
  | { kind: 'staff-sign-in'; link: StaffLink }
  /** `signingIn`: the invited person has an account, and signs in before they accept. */
  | { kind: 'invitation'; token: string; signingIn: boolean }

// An emailed reset link opens the set-password page, and a staff link the staff sign-in page, whoever is signed in. A
// sign-in link starts the provider's sign-in for someone signed out, and a provider's refusal shows on the sign-in page.
const firstPage = (): AuthPage => {
  const href = window.location.href
  const link = readResetLink(href)
  if (link) return { kind: 'reset-password', token: link.token }
  const staff = readStaffLink(href)
  if (staff) return { kind: 'staff-sign-in', link: staff }
  const invitation = readInvitationLink(href)
  if (invitation) return { kind: 'invitation', token: invitation.token, signingIn: false }
  const provider = readSignInLink(href)
  if (provider) return { kind: 'provider-sign-in', provider }
  const providerError = readProviderError(href)
  return providerError ? { kind: 'sign-in', providerError } : { kind: 'sign-in' }
}

const forgetResetLink = () => window.history.replaceState(window.history.state, '', withoutResetLink(window.location.href))
const forgetStaffLink = () => window.history.replaceState(window.history.state, '', withoutStaffLink(window.location.href))
const forgetSignInLink = () => window.history.replaceState(window.history.state, '', withoutSignInLink(window.location.href))
const forgetInvitationLink = () => window.history.replaceState(window.history.state, '', withoutInvitationLink(window.location.href))

/**
 * Shows the app when the user is signed in (or the server has no login), or to a visitor when the project lets them
 * browse, and the right page otherwise: the sign-in steps, or the page an emailed reset link, an invitation link or a
 * staff link opened. An invited person with an account signs in first and comes back to the invitation.
 */
export const AuthGate = ({ workspace, children }: { workspace?: string; children: ReactNode }) => {
  const { state, recheck, passwordReset, signOut, signInProviders, showSignIn, browse } = useAuth()
  const [page, setPage] = useState(firstPage)
  // A notice, an error and a sent code are for the next sign-in only: once its first step went through, signing out
  // starts over. A sign-in link opened by someone signed in already has nothing left to do.
  useEffect(() => {
    if (state.kind === 'signed-in' || state.kind === 'two-factor' || state.kind === 'setup-required') {
      setPage((current) => {
        if (current.kind === 'provider-sign-in') forgetSignInLink()
        const stale = current.kind === 'email-code' || current.kind === 'provider-sign-in' || (current.kind === 'sign-in' && (current.notice || current.error || current.providerError))
        return stale ? { kind: 'sign-in' } : current
      })
    }
  }, [state.kind])
  // The provider's refusal shows once; the address keeps no trace of it.
  useEffect(() => {
    if (state.kind === 'signed-out' && page.kind === 'sign-in' && page.providerError) forgetSignInLink()
  }, [state.kind, page])
  // The sign-in steps stand in for the whole app, router included, without an entry of their own in the tab's history:
  // a visitor who goes back or forward from them browses again, on the page the address now names.
  useEffect(() => {
    if (state.kind !== 'signed-out' || !browse) return
    const leave = () => {
      setPage({ kind: 'sign-in' })
      browse()
    }
    window.addEventListener('popstate', leave)
    return () => window.removeEventListener('popstate', leave)
  }, [state.kind, browse])
  const signInFailed = useCallback((error: string) => setPage({ kind: 'sign-in', error }), [])

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
    void signOut().then(showSignIn)
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
  if (page.kind === 'staff-sign-in') {
    return (
      <StaffSignInPage
        link={page.link}
        onBack={() => {
          forgetStaffLink()
          setPage({ kind: 'sign-in' })
        }}
      />
    )
  }
  const signedOut = state.kind === 'signed-out' || state.kind === 'visitor'
  if (page.kind === 'invitation' && (state.kind === 'signed-in' || (signedOut && !page.signingIn))) {
    return (
      <InvitationPage
        token={page.token}
        onDone={() => {
          forgetInvitationLink()
          setPage({ kind: 'sign-in' })
        }}
        onSignIn={() => {
          setPage({ ...page, signingIn: true })
          showSignIn()
        }}
      />
    )
  }
  if (state.kind === 'signed-in') return children
  // A visitor browses until they ask to sign in, or a link or a notice is for the sign-in steps.
  if (state.kind === 'visitor' && page.kind === 'sign-in' && !page.notice && !page.error && !page.providerError) return children
  if (state.kind === 'two-factor') return <TwoFactorPage methods={state.methods} onBack={backToSignIn} />
  if (state.kind === 'setup-required') return <SetupRequiredPage key={state.missing.join()} missing={state.missing} />
  if (page.kind === 'provider-sign-in') return <ProviderSignInPage provider={page.provider} workspace={workspace} onFailed={signInFailed} />
  if (page.kind === 'forgot-password') return <ForgotPasswordPage onBack={() => setPage({ kind: 'sign-in' })} />
  if (page.kind === 'email-code') return <EmailCodePage email={page.email} onBack={() => setPage({ kind: 'sign-in' })} />
  // An invited person signing in sees the plain sign-in page, and the invitation once they are in.
  const signIn = page.kind === 'sign-in' ? page : { kind: 'sign-in' as const }
  // The provider's callback does not say which provider it was; with one, it is that one.
  const providerError = signIn.providerError && providerMessage(signIn.providerError, signInProviders.length === 1 ? signInProviders[0]!.name : 'the provider')
  const error = signIn.error ?? providerError
  return <SignInPage key={error} workspace={workspace} notice={signIn.notice} error={error} onForgotPassword={passwordReset ? () => setPage({ kind: 'forgot-password' }) : undefined} onCodeSent={(email) => setPage({ kind: 'email-code', email })} onBrowse={browse} />
}
