import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createAuthSession, createClient, type AuthSession, type AuthUser, type PlatformSignIn, type PluginRef, type SamlSignIn, type RequiredSetup, type SetupStatus, type SignInMethod, type SignInResult, type StaffSignIn, type TwoFactorMethod } from '@protobase/client'
import type { Locale } from '@protobase/schema/internal'
import { nativeAuthFetch, type NativeBridge } from '../app/native-auth-fetch'
import { pushNotifications, type PushNotifications } from '../notifications/push/push-notifications'
import type { PushUser } from '../notifications/push/web-push'
import { providerName, withoutSignInLink } from './provider-link'
import { text } from './messages'

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'needs-admin' }
  | { kind: 'signed-out' }
  /** Not signed in, browsing what the project's anonymous role reads; the sign-in route signs them in. */
  | { kind: 'visitor' }
  /** The password or emailed code was right; the account's second step is next. */
  | { kind: 'two-factor'; methods: TwoFactorMethod[] }
  /** Signed in, but the sign-in policy requires something the account has not set up; no API token until it has. */
  | { kind: 'setup-required'; user: AuthUser; missing: RequiredSetup[] }
  /** `staff`: staff of the operator signed in as `user`, for support; the app shows a banner to stop it. */
  | { kind: 'signed-in'; user: AuthUser; staff?: StaffSignIn }
  | { kind: 'error'; message: string }

export type AuthApi = {
  state: AuthState
  session: AuthSession
  /** The ways to sign in the server's policy leaves on. */
  signInMethods: SignInMethod[]
  /** The server can email reset links, so the sign-in page offers "Forgot password?". */
  passwordReset: boolean
  /** MCP clients can connect to the app, so the account page lists those the person allowed. */
  mcp: boolean
  /** Anyone can make their own account, so the sign-in page and sign-in prompts offer "Create an account". */
  canSignUp: boolean
  /** The domains people's passkeys were made for, when more than one, the passkey domain first; otherwise empty. */
  passkeyDomains: string[]
  /** Each sign-in step rejects with `AuthError`, for the form to show. */
  signIn: (email: string, password: string) => Promise<void>
  sendSignInCode: (email: string) => Promise<void>
  signInWithCode: (email: string, code: string) => Promise<void>
  /** Open sign-up: emails a code for making an account with the address. */
  sendSignUpCode: (email: string) => Promise<void>
  /** Checks the emailed sign-up code on its own; resolves with the ticket that makes the account with `signUp`. */
  verifySignUpCode: (email: string, code: string) => Promise<string>
  /** Makes the account for the address whose code was right, with the ticket that answered it, and signs in with it. */
  signUp: (input: { ticket: string; name: string; password?: string }) => Promise<void>
  /** With a passkey of the app's passkey domain, or of `domain`, one of `passkeyDomains`. */
  signInWithPasskey: (domain?: string) => Promise<void>
  /** The second step, while `state` is `two-factor`. */
  verifyTwoFactor: (input: { method: TwoFactorMethod | 'backup'; code: string; trustDevice?: boolean }) => Promise<void>
  /** The ids of the server's OAuth sign-in providers, for example `github`: those an account can be linked to. */
  socialProviders: string[]
  /** The server's sign-in providers with the names to show, the platform's own and the SAML identity providers included. */
  signInProviders: SignInProvider[]
  /** Leaves for the sign-in of any of `signInProviders`, which comes back to this page; rejects with `AuthError`. */
  signInSocial: (provider: string) => Promise<void>
  /** Leaves for the provider to link the signed-in account to it, which comes back to this page; rejects with `AuthError`. */
  linkProvider: (provider: string) => Promise<void>
  /** The operator provider's name when its staff can sign in as people here. */
  staffSignIn?: string
  /** When the app has organizations: who may create them, and the roles with their labels. */
  organizations?: NonNullable<SetupStatus['organizations']>
  /** Ends a staff session: the browser is signed out, and the log notes the end. */
  stopStaffSession: () => Promise<void>
  signOut: () => Promise<void>
  /** The API said 401 twice: back to the sign-in page. Signing in again shows what the account has to set up, if anything. */
  markSignedOut: () => void
  /** Someone signed out browses as a visitor again, when the server lets visitors browse without signing in. */
  browse?: () => void
  /** Reads the setup status and session again, for "Check again" and after setting up a required method. */
  recheck: () => void
  /** The plugins the app loads before anyone signs in, as the setup status names them. */
  beforeSignIn: PluginRef[]
  /** The language the app sets for everyone, as the setup status names it, for the screens before `/meta`. */
  locale?: Locale
  /**
   * Reads the session again after something other than the sign-in page started one, such as a plugin that traded a
   * one-time code for the session cookie, and enters the app with it. Resolves `false` when there is none.
   */
  adoptSession: () => Promise<boolean>
  /** Push in this browser for the signed-in user (see `usePushNotifications`); signing out and in keeps it with them. */
  push: PushNotifications
}

/** A sign-in provider as the app offers it: its id and its name. */
export type SignInProvider = { id: string; name: string }

const AuthContext = createContext<AuthApi | null>(null)

export const useAuth = () => {
  const api = useContext(AuthContext)
  if (!api) throw new Error('useAuth must be used inside AuthProvider')
  return api
}

/**
 * Finds out whether the server has a login and who is signed in, and keeps that state for the app. Without a `session`,
 * it makes one on `origin`, the page's own by default; in the iOS or Android app, with its `nativeBridge`, the session
 * signs in through native HTTP, and "Forgot password?" is not offered, as a reset link cannot come back to the app.
 */
export const AuthProvider = ({ session: given, origin, nativeBridge, children }: { session?: AuthSession; origin?: string; nativeBridge?: NativeBridge; children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })
  const [signInMethods, setSignInMethods] = useState<SignInMethod[]>(['password'])
  const [passwordReset, setPasswordReset] = useState(false)
  const [mcp, setMcp] = useState(false)
  const [canSignUp, setCanSignUp] = useState(false)
  const [passkeyDomains, setPasskeyDomains] = useState<string[]>([])
  const [socialProviders, setSocialProviders] = useState<string[]>([])
  const [platformSignIn, setPlatformSignIn] = useState<PlatformSignIn>()
  const [samlProviders, setSamlProviders] = useState<SamlSignIn[]>([])
  const [staffSignIn, setStaffSignIn] = useState<string>()
  const [organizations, setOrganizations] = useState<SetupStatus['organizations']>()
  // Whether visitors may browse without signing in; signing out then goes back to browsing.
  const [anonymous, setAnonymous] = useState(false)
  const [beforeSignIn, setBeforeSignIn] = useState<PluginRef[]>([])
  const [locale, setLocale] = useState<Locale>()
  const signedOutState = useCallback((): AuthState => (anonymous ? { kind: 'visitor' } : { kind: 'signed-out' }), [anonymous])
  // The session is over: push here is forgotten, with no server left to ask.
  const forgetPush = useRef<() => Promise<void>>(async () => {})
  const markSignedOut = useCallback(() => {
    void forgetPush.current()
    setState((current) => (current.kind === 'signed-in' ? { kind: 'signed-out' } : current))
  }, [])
  const signedOut = useRef(markSignedOut)
  signedOut.current = markSignedOut
  const session = useMemo(
    () =>
      given ??
      createAuthSession({
        ...(origin && { origin }),
        ...(nativeBridge && { fetch: nativeAuthFetch(nativeBridge, origin ?? window.location.origin) }),
        onSignedOut: () => signedOut.current(),
      }),
    [given, origin, nativeBridge],
  )

  // Push follows who is signed in: the helper reads it at each step, and only someone signed in as themselves has it.
  const pushUser = useRef<PushUser>(undefined)
  pushUser.current = state.kind === 'signed-in' ? { id: state.user.id, own: !state.staff } : undefined
  const push = useMemo(() => {
    const client = createClient({ baseUrl: `${origin ?? globalThis.location?.origin ?? ''}/api/v1`, token: ({ refresh }) => session.token({ refresh }) })
    const meta = async () => {
      const answer = await client.meta()
      if (answer.status !== 'modified') throw new Error('The app answered /meta without its content')
      return { appName: answer.meta.appName, ...(answer.meta.notifications && { webPushKey: answer.meta.notifications.webPushKey }) }
    }
    return pushNotifications({ ...(nativeBridge && { nativeBridge }), devices: client.devices, meta, user: () => pushUser.current })
  }, [session, origin, nativeBridge])

  forgetPush.current = push.forget

  // Signed in: the app opens unless the policy requires something the account lacks, which it never does for staff.
  // Signing out later shows the sign-in page again. Push in this browser is kept only for this same user.
  const enter = useCallback(
    async (user: AuthUser) => {
      const [{ missing }, staff] = await Promise.all([session.account.signInMethods(), session.staff.current()])
      setState(missing.length > 0 ? { kind: 'setup-required', user, missing } : { kind: 'signed-in', user, ...(staff && { staff }) })
      if (missing.length === 0) void push.adopt({ id: user.id, own: !staff })
    },
    [session, push],
  )

  const finish = useCallback(async (result: SignInResult) => (result.kind === 'two-factor' ? setState({ kind: 'two-factor', methods: result.methods }) : enter(result.user)), [enter])

  const recheck = useCallback(() => {
    setState({ kind: 'loading' })
    void session.status().then(async (status) => {
      setSignInMethods(status.signInMethods)
      setPasswordReset(status.passwordReset && !nativeBridge)
      setMcp(Boolean(status.mcp))
      setCanSignUp(Boolean(status.signUp))
      setPasskeyDomains(status.passkeyDomains ?? [])
      setSocialProviders(status.socialProviders)
      setPlatformSignIn(status.platformSignIn)
      setSamlProviders(status.samlProviders)
      setStaffSignIn(status.staffSignIn)
      setOrganizations(status.organizations)
      setAnonymous(Boolean(status.anonymous))
      setBeforeSignIn(status.plugins ?? [])
      setLocale(status.locale)
      if (status.needsAdmin) return setState({ kind: 'needs-admin' })
      const user = await session.session()
      return user ? enter(user) : setState({ kind: status.anonymous ? 'visitor' : 'signed-out' })
    }).catch((error: unknown) => setState({ kind: 'error', message: error instanceof Error ? error.message : text('noAnswer') }))
  }, [session, enter, nativeBridge])

  useEffect(recheck, [recheck])

  const api = useMemo<AuthApi>(
    () => ({
      state,
      session,
      signInMethods,
      passwordReset,
      mcp,
      canSignUp,
      passkeyDomains,
      socialProviders,
      signInProviders: [...socialProviders.map((id) => ({ id, name: providerName(id, platformSignIn) })), ...samlProviders],
      staffSignIn,
      ...(organizations && { organizations }),
      markSignedOut,
      recheck,
      beforeSignIn,
      locale,
      adoptSession: async () => {
        const user = await session.session()
        if (!user) return false
        await enter(user)
        return true
      },
      ...(anonymous && {
        browse: () => {
          setState((current) => (current.kind === 'signed-out' ? { kind: 'visitor' } : current))
        },
      }),
      signIn: async (email, password) => finish(await session.signIn(email, password)),
      sendSignInCode: (email) => session.sendSignInCode(email),
      signInWithCode: async (email, code) => finish(await session.signInWithCode(email, code)),
      sendSignUpCode: (email) => session.sendSignUpCode(email),
      verifySignUpCode: (email, code) => session.verifySignUpCode(email, code),
      signUp: async (input) => enter(await session.signUp(input)),
      signInWithPasskey: async (domain) => enter(await session.signInWithPasskey(domain)),
      verifyTwoFactor: async (input) => enter(await session.verifyTwoFactor(input)),
      // The provider comes back to this page without a link's marker, so it does not start again.
      signInSocial: async (provider) => {
        const callbackURL = new URL(withoutSignInLink(window.location.href), window.location.href).href
        const saml = samlProviders.some((candidate) => candidate.id === provider)
        window.location.assign(await (saml ? session.signInSaml(provider, callbackURL) : session.signInSocial(provider, callbackURL)))
      },
      linkProvider: async (provider) => {
        window.location.assign(await session.account.linkProvider(provider, new URL(withoutSignInLink(window.location.href), window.location.href).href))
      },
      stopStaffSession: async () => {
        await push.forget()
        await session.staff.stop()
        setState(signedOutState())
      },
      // Push goes first, while the token can still remove the device; it waits only briefly, then the session ends.
      signOut: async () => {
        await push.turnOff()
        await session.signOut()
        setState(signedOutState())
      },
      push,
    }),
    [push, state, session, signInMethods, passwordReset, mcp, canSignUp, passkeyDomains, socialProviders, platformSignIn, samlProviders, staffSignIn, organizations, anonymous, beforeSignIn, locale, signedOutState, markSignedOut, recheck, finish, enter],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
