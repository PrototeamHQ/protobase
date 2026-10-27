import { useEffect, useState, type ReactNode } from 'react'
import { AuthError, type ConnectingClient } from '@protobase/client'
import { useRouter } from '../app/router'
import { authMessage } from '../auth/auth-messages'
import { AuthLayout } from '../auth/auth-layout'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { clientName } from './client-name'
import { clientPublisher } from './client-publisher'
import { allowDelayMs, isFramed as isFramedWindow, useArmedAfterFocus, useGuardedPress } from './interaction-guard'
import { isSafeTarget, redirectTarget, type RedirectTarget } from './redirect-target'
import { signedRequestFor } from './signed-request'
import { useConnectAddress } from './use-connect-address'

// Why the request cannot go on, by the code the server answers with, in words for the person at the keyboard.
const refusals: Record<string, string> = {
  invalid_signature: 'This request has expired: connect again from your app.',
  STAFF_CANNOT_CONNECT: 'Staff signed in as someone cannot allow apps to act for them.',
  SIGN_IN_SETUP_REQUIRED: 'Set up what this app requires for signing in first, then connect again from your app.',
  ADDRESS_NOT_VERIFIED: 'Confirm your address first: sign out, then sign in with a code emailed to you, and connect again from your app.',
}

const refusalOf = (failure: unknown) => {
  if (!(failure instanceof AuthError)) throw failure
  return (failure.code && refusals[failure.code]) ?? authMessage(failure)
}

// The browser goes on to where the server says, never to a page that runs script of its own.
const goWith = (assign: (url: string) => void) => (url: string) => {
  if (!isSafeTarget(url)) throw new AuthError('The app asked to be sent somewhere this page will not go.', 400)
  assign(url)
}

type Asking = { oauthQuery: string; client: ConnectingClient; target: RedirectTarget | undefined }
type State = { kind: 'loading' } | { kind: 'asking'; asking: Asking } | { kind: 'failed'; message: string }

const TargetText = ({ target }: { target: RedirectTarget }) =>
  target.kind === 'site' ? (
    <>
      the website <strong className="font-medium text-foreground">{target.host}</strong>
    </>
  ) : target.kind === 'this-computer' ? (
    <>an app on this computer (port {target.port})</>
  ) : (
    <>
      an app on this device that opens <code className="break-all text-foreground">{target.uri}</code>
    </>
  )

// What the page tells instead of asking, alone on the page as the sign-in pages are.
const Notice = ({ title, icon, children }: { title: string; icon: string | undefined; children: ReactNode }) => (
  <AuthLayout title={title} icon={icon}>
    <p className="text-muted-foreground">{children}</p>
  </AuthLayout>
)

type RequestProps = { asking: Asking; appName: string; appIcon: string | undefined; email: string; onAnswer: (accept: boolean) => Promise<void>; onSignOut: () => void }

const Request = ({ asking, appName, appIcon, email, onAnswer, onSignOut }: RequestProps) => {
  const [busy, setBusy] = useState(false)
  const armed = useArmedAfterFocus(allowDelayMs)
  const answer = (accept: boolean) => {
    setBusy(true)
    void onAnswer(accept).finally(() => setBusy(false))
  }
  const allow = useGuardedPress(armed && !busy, () => answer(true))
  const name = clientName(asking.client.client_name)
  const publisher = clientPublisher(asking.client.client_id)
  const { target } = asking
  return (
    <AuthLayout title={`Allow an app to act as you in ${appName}?`} icon={appIcon} size="md">
      <section aria-label="Allow an app">
        <p>
          An app that calls itself{' '}
          <bdi className="inline-block max-w-full truncate align-bottom font-medium" title={name}>
            “{name ?? 'no name'}”
          </bdi>{' '}
          asks to act as you here.
        </p>
        {publisher && <p className="mt-1 text-muted-foreground">Published by {publisher}.</p>}
        {target ? (
          <p className="mt-3 text-muted-foreground">
            Allowing sends you on to <TargetText target={target} />.
          </p>
        ) : (
          <p role="alert" className="mt-3 text-danger-text">
            This app asked to be sent somewhere this page will not go, so it cannot be allowed.
          </p>
        )}
        <p className="mt-3 text-muted-foreground">It can then read and change what you can, with your current role and organization, until you disconnect it from your account page.</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={busy} onClick={() => answer(false)}>
            Deny
          </Button>
          {target && (
            <Button variant="primary" loading={busy} disabled={!armed || busy} {...allow}>
              Allow
            </Button>
          )}
        </div>
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          Signed in as {email}.{' '}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onSignOut}>
            Not you? Sign out
          </button>
        </p>
      </section>
    </AuthLayout>
  )
}

type ConnectingProps = { oauthQuery: string; appName: string; appIcon: string | undefined; email: string; assign: (url: string) => void }

const Connecting = ({ oauthQuery, appName, appIcon, email, assign }: ConnectingProps) => {
  const { session, signOut } = useAuth()
  const { path, basePath } = useRouter()
  const go = goWith(assign)
  // The new signed request when the server sends the browser back to this page, on this origin only.
  const signedRequest = (url: string) => signedRequestFor(url, { origin: window.location.origin, pathname: `${basePath}${path}` })
  const [state, setState] = useState<State>({ kind: 'loading' })
  const fail = (failure: unknown) => setState({ kind: 'failed', message: refusalOf(failure) })

  // Picks the request up as the person signed in: asks them, or goes on when they allowed the app before.
  useEffect(() => {
    let current = true
    const ask = async () => {
      const { url } = await session.connect.resume(oauthQuery)
      const query = signedRequest(url)
      if (query === undefined) return go(url)
      const params = new URLSearchParams(query)
      const client = await session.connect.client(params.get('client_id') ?? '')
      if (current) setState({ kind: 'asking', asking: { oauthQuery: query, client, target: redirectTarget(params.get('redirect_uri') ?? '') } })
    }
    ask().catch((failure: unknown) => current && fail(failure))
    return () => {
      current = false
    }
    // Picked up once per signed request: `go` and `signedRequest` are made anew each render, from the same values.
  }, [session, oauthQuery])

  const answer = async (accept: boolean, asking: Asking) => {
    try {
      const { url } = await session.connect.answer(accept, asking.oauthQuery)
      // The app asked for a fresh sign-in: sign out, and sign in again on the same request.
      if (signedRequest(url) !== undefined) await signOut()
      go(url)
    } catch (failure) {
      fail(failure)
    }
  }

  if (state.kind === 'failed') return <Notice title="This app cannot be connected" icon={appIcon}>{state.message}</Notice>
  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-full w-full items-center justify-center gap-2 bg-surface text-muted-foreground">
        <Spinner /> Loading
      </div>
    )
  }
  return <Request asking={state.asking} appName={appName} appIcon={appIcon} email={email} onAnswer={(accept) => answer(accept, state.asking)} onSignOut={() => void signOut()} />
}

export type ConnectPageProps = {
  /** The signed-in person's address, shown so they see who they allow the app to act as. */
  email: string
  appName: string
  /** The path of the app's own icon, shown at the top of the page in place of Protobase's mark. */
  appIcon?: string
  /** Whether the page runs inside another page's frame; the window's own answer unless a story sets it. */
  isFramed?: () => boolean
  /** Sends the browser on, to the client or a fresh sign-in; `location.assign` unless a story sets it. */
  assign?: (url: string) => void
}

/**
 * The connect page: someone signed in allows an outside app, such as an MCP client, to act as them, from the request
 * the server signed and sent here. It stands alone on the page, as the sign-in pages do, without the app's shell. Inside another page's frame it shows only that it cannot be used there and calls
 * nothing, whatever headers the host sent; Allow takes a click only once the page has been in front for a moment.
 */
export const ConnectPage = ({ email, appName, appIcon, isFramed = isFramedWindow, assign = (url) => window.location.assign(url) }: ConnectPageProps) => {
  const [framed] = useState(isFramed)
  const { oauthQuery } = useConnectAddress()
  if (framed) {
    return (
      <Notice title="This page cannot be used inside another site" icon={appIcon}>
        <a href={window.location.href} target="_blank" rel="noopener" className="underline underline-offset-2">
          Open it on its own
        </a>{' '}
        to go on.
      </Notice>
    )
  }
  if (!oauthQuery) return <Notice title="Nothing to connect" icon={appIcon}>Connect again from your app.</Notice>
  return <Connecting key={oauthQuery} oauthQuery={oauthQuery} appName={appName} appIcon={appIcon} email={email} assign={assign} />
}
