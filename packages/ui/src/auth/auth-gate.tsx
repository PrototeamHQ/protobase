import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { signInPath, type SignInStep } from '@protobase/schema'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { useRouter } from '../app/router'
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
import { SignUpPage } from './sign-up-page'
import { readStaffLink, withoutStaffLink, type StaffLink } from './staff-link'
import { StaffSignInPage } from './staff-sign-in-page'
import { TwoFactorPage } from './two-factor-page'
import { useSignInAddress } from './use-sign-in-address'
import { readInvitationLink, withoutInvitationLink } from '../organizations/invitation-link'
import { InvitationPage } from '../organizations/invitation-page'
import { BeforeSignIn } from '../plugins/before-sign-in'
import { text } from './messages'

type AuthPage =
  /**
   * The sign-in route's steps, which its address names. `notice`, `error` and `providerError` are for its first step:
   * `error` says why the last sign-in did not go through, `providerError` is the code a provider came back with.
   */
  | { kind: 'sign-in'; notice?: string; error?: string; providerError?: string }
  | { kind: 'provider-sign-in'; provider: string }
  | { kind: 'reset-password'; token: string | undefined }
  | { kind: 'staff-sign-in'; link: StaffLink }
  /** The invited person sees it signed in, or signed out off the sign-in route, where one with an account signs in first. */
  | { kind: 'invitation'; token: string }

// An emailed reset link opens the set-password page, and a staff link the staff sign-in page, whoever is signed in. A
// sign-in link starts the provider's sign-in for someone signed out, and a provider's refusal shows on the sign-in page.
const firstPage = (): AuthPage => {
  const href = window.location.href
  const link = readResetLink(href)
  if (link) return { kind: 'reset-password', token: link.token }
  const staff = readStaffLink(href)
  if (staff) return { kind: 'staff-sign-in', link: staff }
  const invitation = readInvitationLink(href)
  if (invitation) return { kind: 'invitation', token: invitation.token }
  const provider = readSignInLink(href)
  if (provider) return { kind: 'provider-sign-in', provider }
  const providerError = readProviderError(href)
  return providerError ? { kind: 'sign-in', providerError } : { kind: 'sign-in' }
}

/** Moves to `to`, below the base path, in place of this page in the tab's history, as soon as it shows. */
const Redirect = ({ to }: { to: string }) => {
  const { navigate } = useRouter()
  useEffect(() => navigate(to, { replace: true }), [navigate, to])
  return null
}

/**
 * Shows the app when the user is signed in (or the server has no login), or to a visitor when the project lets them
 * browse, and the right page otherwise: the step of the sign-in route the address names, or the page an emailed reset
 * link, an invitation link or a staff link opened. Someone signed out without a visitor's browsing goes to the sign-in
 * route, and signing in comes back to the page the route was opened from. An invited person with an account signs in
 * first and comes back to the invitation. The plugins the app loads before sign-in draw around what someone signed
 * out sees (see `BeforeSignIn`), while the gate keeps its state.
 */
export const AuthGate = ({ workspace, children }: { workspace?: string; children: ReactNode }) => {
  const page = useAuthPage(workspace, children)
  return <BeforeSignIn>{page}</BeforeSignIn>
}

// What the gate shows, by the sign-in state and the page the address or a link opened.
const useAuthPage = (workspace: string | undefined, children: ReactNode): ReactNode => {
  const { state, recheck, passwordReset, signOut, signInProviders, canSignUp, browse } = useAuth()
  const { path, params, basePath, navigate } = useRouter()
  const { address, next, open, link, leave } = useSignInAddress()
  const [page, setPage] = useState(firstPage)
  // The addresses the steps that enter an emailed code were for, and what a right sign-up code was traded for. After a
  // reload they are gone, and so are the steps that need them.
  const [codeEmail, setCodeEmail] = useState<string>()
  const [signUpEmail, setSignUpEmail] = useState<string>()
  const [signUpTicket, setSignUpTicket] = useState<string>()

  // Takes a used link's parameters out of the address, in place of it in the tab's history.
  const href = new URL(`${basePath}${path}${params.size > 0 ? `?${params}` : ''}`, window.location.origin).href
  const forget = useCallback(
    (without: (href: string) => string) => {
      const below = without(href).slice(basePath.length)
      navigate(below.startsWith('/') ? below : `/${below}`, { replace: true })
    },
    [href, basePath, navigate],
  )

  // A notice, an error and a sent code are for the next sign-in only: once its first step went through, signing out
  // starts over. A sign-in link opened by someone signed in already has nothing left to do.
  const entered = state.kind === 'signed-in' || state.kind === 'two-factor' || state.kind === 'setup-required'
  useEffect(() => {
    if (!entered) return
    if (page.kind === 'provider-sign-in') forget(withoutSignInLink)
    const stale = page.kind === 'provider-sign-in' || (page.kind === 'sign-in' && (page.notice || page.error || page.providerError))
    if (stale) setPage({ kind: 'sign-in' })
    setCodeEmail(undefined)
    setSignUpEmail(undefined)
    setSignUpTicket(undefined)
  }, [entered, page, forget])
  // The provider's refusal shows once; the address keeps no trace of it. Off the sign-in route, opening the route does.
  const providerErrorLeft = address !== undefined && readProviderError(href) !== undefined
  useEffect(() => {
    if (!entered && page.kind === 'sign-in' && page.providerError && providerErrorLeft) forget(withoutSignInLink)
  }, [entered, page, providerErrorLeft, forget])
  const signInFailed = useCallback((error: string) => setPage({ kind: 'sign-in', error }), [])

  const leaveResetPage = (next: AuthPage) => {
    forget(withoutResetLink)
    setPage(next)
  }
  // The reset ended every session, so the app forgets its own as well.
  const passwordChanged = async () => {
    if (state.kind === 'signed-in') await signOut()
    leaveResetPage({ kind: 'sign-in', notice: text('passwordChanged') })
  }
  const backToSignIn = () => {
    setPage({ kind: 'sign-in' })
    void signOut().then(() => open('sign-in', { replace: true }))
  }

  switch (state.kind) {
    case 'loading':
      return (
        <div className="flex h-full min-h-48 items-center justify-center gap-2 text-muted-foreground">
          <Spinner /> {text('loading')}
        </div>
      )
    case 'error':
      return (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-muted-foreground">{text('cannotReach', state.message)}</p>
          <Button onClick={recheck}>{text('tryAgain')}</Button>
        </div>
      )
    case 'needs-admin':
      return <FirstRunPage onCheckAgain={recheck} />
  }
  // Signed in on the sign-in route: on to the page it was opened from.
  if (state.kind === 'signed-in' && address) return <Redirect to={next ?? '/'} />
  if (page.kind === 'reset-password') {
    return (
      <ResetPasswordPage
        token={page.token}
        onDone={() => void passwordChanged()}
        onRequestNewLink={
          passwordReset
            ? () => {
                setPage({ kind: 'sign-in' })
                navigate(signInPath({ step: 'forgot-password' }), { replace: true })
              }
            : undefined
        }
        onBack={() => leaveResetPage({ kind: 'sign-in' })}
      />
    )
  }
  if (page.kind === 'staff-sign-in') {
    return (
      <StaffSignInPage
        link={page.link}
        onBack={() => {
          forget(withoutStaffLink)
          setPage({ kind: 'sign-in' })
        }}
      />
    )
  }
  const signedOut = state.kind === 'signed-out' || state.kind === 'visitor'
  if (page.kind === 'invitation' && (state.kind === 'signed-in' || (signedOut && !address))) {
    return (
      <InvitationPage
        token={page.token}
        onDone={() => {
          forget(withoutInvitationLink)
          setPage({ kind: 'sign-in' })
        }}
        signIn={link()}
      />
    )
  }
  if (state.kind === 'signed-in') return children
  if (state.kind === 'two-factor') return <TwoFactorPage methods={state.methods} onBack={backToSignIn} />
  if (state.kind === 'setup-required') return <SetupRequiredPage key={state.missing.join()} missing={state.missing} />
  if (page.kind === 'provider-sign-in') return <ProviderSignInPage provider={page.provider} workspace={workspace} onFailed={signInFailed} />
  // An invited person signing in sees the plain sign-in page, and the invitation once they are in.
  const signIn = page.kind === 'sign-in' ? page : { kind: 'sign-in' as const }
  if (!address) {
    // A visitor browses until they open the sign-in route. Someone signed out, or a notice or an error for the sign-in
    // page, opens it in place of this page, and signing in comes back here.
    const message = signIn.notice || signIn.error || signIn.providerError
    return state.kind === 'visitor' && !message ? children : <Redirect to={signInPath({ next })} />
  }

  // A step needs what the one before asked for, which a reload forgets, and the server to offer it; else it is the first.
  const offered: Record<SignInStep, boolean> = {
    'sign-in': true,
    'forgot-password': passwordReset,
    'email-code': codeEmail !== undefined,
    'sign-up': canSignUp,
    'sign-up-code': canSignUp && signUpEmail !== undefined,
    'sign-up-details': canSignUp && signUpTicket !== undefined,
  }
  const step = offered[address.step] ? address.step : 'sign-in'
  const backTo = (target: SignInStep) => () => open(target, { replace: true })
  // Back to browsing the page the route was opened from, for someone the API signed out as well.
  const onBrowse = browse && (() => {
    browse()
    leave()
  })
  if (step === 'forgot-password') return <ForgotPasswordPage back={link('sign-in', { replace: true })} />
  if (step === 'email-code') return <EmailCodePage email={codeEmail!} onBack={backTo('sign-in')} />
  if (step === 'sign-up' || step === 'sign-up-code' || step === 'sign-up-details') {
    // The code works once, so the step that took it gives its place in the tab's history to the next: Back from the
    // name and password goes to the address.
    return (
      <SignUpPage
        key={step}
        workspace={workspace}
        email={step === 'sign-up' ? undefined : signUpEmail}
        ticket={step === 'sign-up-details' ? signUpTicket : undefined}
        onCodeSent={(email) => {
          setSignUpEmail(email)
          setSignUpTicket(undefined)
          open('sign-up-code')
        }}
        onVerified={(ticket) => {
          setSignUpTicket(ticket)
          open('sign-up-details', { replace: true })
        }}
        onBack={backTo('sign-up')}
        onSignIn={() => open('sign-in')}
        onBrowse={onBrowse}
      />
    )
  }
  // The provider's callback does not say which provider it was; with one, it is that one.
  const providerError = signIn.providerError && providerMessage(signIn.providerError, signInProviders.length === 1 ? signInProviders[0]!.name : 'the provider')
  const error = signIn.error ?? providerError
  return (
    <SignInPage
      key={error}
      workspace={workspace}
      notice={signIn.notice}
      error={error}
      forgotPassword={passwordReset ? link('forgot-password') : undefined}
      onCodeSent={(email) => {
        setCodeEmail(email)
        open('email-code')
      }}
      signUp={canSignUp ? link('sign-up') : undefined}
      onBrowse={onBrowse}
    />
  )
}
