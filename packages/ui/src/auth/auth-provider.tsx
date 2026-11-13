import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createAuthSession, createClient, type AuthSession, type AuthUser, type PersonalMailLink, type PluginRef, type SamlSignIn, type SetupStatus, type SignInMethod, type SignInResult, type TwoFactorMethod, type WorkflowConnection } from '@protobase/client'
import type { Locale } from '@protobase/schema/internal'
import { nativeAuthFetch, type NativeBridge } from '../app/native-auth-fetch'
import { pushNotifications, type PushNotifications } from '../notifications/push/push-notifications'
import type { PushUser } from '../notifications/push/web-push'
import { useStartCache } from '../data/start-cache/start-cache'
import { providerName, withoutSignInLink } from './provider-link'
import type { AuthState } from './auth-state'
import { startCacheStep } from './start-session'
import { text } from './messages'

export type { AuthState } from './auth-state'

export type AuthApi = {
  state: AuthState
  session: AuthSession
  /** The ways to sign in the server's policy leaves on. */
  signInMethods: SignInMethod[]
  /** What the sign-in page leads with: a password, or an emailed code with the password behind "Use a password". */
  signInFirst: 'password' | 'emailCode'
  /** The server can email reset links, so the sign-in page offers "Forgot password?". */
  passwordReset: boolean
  /** The server can email the code that confirms a new address, so the account page offers "Change email". */
  changeEmail: boolean
  /** People may delete their own account, so the account page offers "Delete account". */
  accountDeletion: boolean
  /** When MCP clients can connect to the app: its endpoint's `url`, which the account page shows with the clients the person allowed. */
  mcp?: { url: string }
  /** People may make personal access tokens for their scripts, which the account page lists. */
  personalAccessTokens: boolean
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
  /** The mail providers people may link their own mailbox with, for the app to send mail from it. */
  personalMail: PersonalMailLink[]
  /** Leaves for the mail provider to link the signed-in person's mailbox, which comes back to this page; rejects with `AuthError`. */
  linkPersonalMail: (link: PersonalMailLink) => Promise<void>
  /** Leaves for the provider to connect an account for a workflow connection, which comes back to this page; rejects with `AuthError`. */
  connectAccount: (connection: WorkflowConnection) => Promise<void>
  /** The operator provider's name when its staff can sign in as people here. */
  staffSignIn?: string
  /** When the app has organizations: who may create them, and the roles with their labels. */
  organizations?: NonNullable<SetupStatus['organizations']>
  /** Ends a staff session: the browser is signed out, and the log notes the end. */
  stopStaffSession: () => Promise<void>
  signOut: () => Promise<void>
  /** Deletes the signed-in person's account, with their password when it has one, and signs this device out; rejects with `AuthError`. */
  deleteAccount: (password?: string) => Promise<void>
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
  /** The app's name and own icon, and whether the sign-in page ends on the "Runs on Protobase" note, for the screens before `/meta`. */
  identity: AuthIdentity
  /**
   * Reads the session again after something other than the sign-in page started one, such as a plugin that traded a
   * one-time code for the session cookie, and enters the app with it. Resolves `false` when there is none.
   */
  adoptSession: () => Promise<boolean>
  /** Push in this browser for the signed-in user (see `usePushNotifications`); signing out and in keeps it with them. */
  push: PushNotifications
}

/** What the setup status names of the app: its name and the path of its own icon, when it has them, and `runsOnNote`. */
export type AuthIdentity = { appName?: string; appIcon?: string; runsOnNote: boolean }

/** A sign-in provider as the app offers it: its id and its name. */
export type SignInProvider = { id: string; name: string }

const AuthContext = createContext<AuthApi | null>(null)

// What the setup status gives before it has been read, each one value for every render.
const defaultSignInMethods: SignInMethod[] = ['password']
const none: string[] = []
const noMail: PersonalMailLink[] = []
const noSaml: SamlSignIn[] = []
const noPlugins: PluginRef[] = []

export const useAuth = () => {
  const api = useContext(AuthContext)
  if (!api) throw new Error('useAuth must be used inside AuthProvider')
  return api
}

/** The auth state and steps inside `AuthProvider`, `null` outside it, for a part that also works without one. */
export const useOptionalAuth = () => useContext(AuthContext)

type AuthProviderProps = {
  session?: AuthSession
  origin?: string
  nativeBridge?: NativeBridge
  /** Runs after someone signs in on this page, before the app opens; true when it reloaded the page, which then opens it. */
  afterSignIn?: () => Promise<boolean>
  children: ReactNode
}

/**
 * Finds out whether the server has a login and who is signed in, and keeps that state for the app. Without a `session`,
 * it makes one on `origin`, the page's own by default; in the iOS or Android app, with its `nativeBridge`, the session
 * signs in through native HTTP, and "Forgot password?" is not offered, as a reset link cannot come back to the app.
 * Below a `StartCacheProvider`, someone who was signed in starts signed in, and the check runs behind the app.
 * Someone already signed in when the page starts is no sign-in: `afterSignIn` runs only for one made on the page.
 */
export const AuthProvider = ({ session: given, origin, nativeBridge, afterSignIn, children }: AuthProviderProps) => {
  // Someone signed in when the app last ran starts signed in, from the start cache, while the session is checked behind it
  const startCache = useStartCache()
  const [cached] = useState(() => startCache?.session())
  const [state, setState] = useState<AuthState>(() => (cached ? { kind: 'signed-in', user: cached.user } : { kind: 'loading' }))
  const [status, setStatus] = useState<SetupStatus | undefined>(cached?.status)
  const signInMethods = status?.signInMethods ?? defaultSignInMethods
  const signInFirst = status?.signInFirst ?? 'password'
  const passwordReset = Boolean(status?.passwordReset) && !nativeBridge
  const changeEmail = Boolean(status?.changeEmail)
  const accountDeletion = Boolean(status?.accountDeletion)
  const mcp = status?.mcp
  const personalAccessTokens = Boolean(status?.personalAccessTokens)
  const canSignUp = Boolean(status?.signUp)
  const passkeyDomains = status?.passkeyDomains ?? none
  const socialProviders = status?.socialProviders ?? none
  const platformSignIn = status?.platformSignIn
  const personalMail = status?.personalMail ?? noMail
  const samlProviders = status?.samlProviders ?? noSaml
  const staffSignIn = status?.staffSignIn
  const organizations = status?.organizations
  // Whether visitors may browse without signing in; signing out then goes back to browsing.
  const anonymous = Boolean(status?.anonymous)
  const beforeSignIn = status?.plugins ?? noPlugins
  const locale = status?.locale
  const identity = useMemo<AuthIdentity>(() => ({ ...(status?.appName && { appName: status.appName }), ...(status?.appIcon && { appIcon: status.appIcon }), runsOnNote: Boolean(status?.runsOnNote) }), [status])
  const signedOutState = useCallback((): AuthState => (anonymous ? { kind: 'visitor' } : { kind: 'signed-out' }), [anonymous])
  // The session is over: push here is forgotten, with no server left to ask.
  const forgetPush = useRef<() => Promise<void>>(async () => {})
  // Each sign-out starts a new generation, so a check or sign-in step that answers after it changes nothing
  const generation = useRef(0)
  const markSignedOut = useCallback(() => {
    generation.current += 1
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
      return { appName: answer.meta.appName, ...(answer.meta.notifications?.webPushKey && { webPushKey: answer.meta.notifications.webPushKey }) }
    }
    return pushNotifications({ ...(nativeBridge && { nativeBridge }), devices: client.devices, meta, user: () => pushUser.current })
  }, [session, origin, nativeBridge])

  forgetPush.current = push.forget

  const afterSignInRef = useRef(afterSignIn)
  afterSignInRef.current = afterSignIn

  // Signed in: the app opens unless the policy requires something the account lacks, which it never does for staff.
  // Signing out later shows the sign-in page again. Push in this browser is kept only for this same user.
  const enter = useCallback(
    async (user: AuthUser, asked = generation.current) => {
      const [{ missing }, staff] = await Promise.all([session.account.signInMethods(), session.staff.current()])
      if (generation.current !== asked) return
      setState(missing.length > 0 ? { kind: 'setup-required', user, missing } : { kind: 'signed-in', user, ...(staff && { staff }) })
      if (missing.length === 0) void push.adopt({ id: user.id, own: !staff })
    },
    [session, push],
  )

  // A sign-in made on this page first lets `afterSignIn` run, which may reload the page into the app instead; a sign-out
  // meanwhile still wins.
  const signIn = useCallback(
    async (user: AuthUser) => {
      const asked = generation.current
      if (await afterSignInRef.current?.()) return
      await enter(user, asked)
    },
    [enter],
  )

  const finish = useCallback(async (result: SignInResult) => (result.kind === 'two-factor' ? setState({ kind: 'two-factor', methods: result.methods }) : signIn(result.user)), [signIn])

  // Someone signed in stays in the app while it checks: a server that cannot be reached leaves them with what is cached,
  // whose refresh then shows that it failed.
  const recheck = useCallback(() => {
    const asked = generation.current
    setState((current) => (current.kind === 'signed-in' ? current : { kind: 'loading' }))
    void session.status().then(async (status) => {
      setStatus(status)
      if (generation.current !== asked) return
      if (status.needsAdmin) return setState({ kind: 'needs-admin', ...(status.firstAdminUrl && { firstAdminUrl: status.firstAdminUrl }) })
      const user = await session.session()
      if (generation.current !== asked) return
      return user ? enter(user, asked) : setState({ kind: status.anonymous ? 'visitor' : 'signed-out' })
    }).catch((error: unknown) => {
      if (generation.current !== asked) return
      setState((current) => (current.kind === 'signed-in' ? current : { kind: 'error', message: error instanceof Error ? error.message : text('noAnswer') }))
    })
  }, [session, enter])

  useEffect(recheck, [recheck])

  // The start cache keeps someone signed in as themselves, from the moment they are; signing out forgets it all.
  useEffect(() => {
    if (!startCache) return
    const step = startCacheStep(state, status)
    if (step === 'clear') void startCache.clear()
    else if (step !== 'leave') void startCache.saveSession(step.save)
  }, [startCache, state, status])

  const api = useMemo<AuthApi>(
    () => ({
      state,
      session,
      signInMethods,
      signInFirst,
      passwordReset,
      changeEmail,
      accountDeletion,
      mcp,
      personalAccessTokens,
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
      identity,
      adoptSession: async () => {
        const user = await session.session()
        if (!user) return false
        await signIn(user)
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
      signUp: async (input) => signIn(await session.signUp(input)),
      signInWithPasskey: async (domain) => signIn(await session.signInWithPasskey(domain)),
      verifyTwoFactor: async (input) => signIn(await session.verifyTwoFactor(input)),
      // The provider comes back to this page without a link's marker, so it does not start again.
      signInSocial: async (provider) => {
        const callbackURL = new URL(withoutSignInLink(window.location.href), window.location.href).href
        const saml = samlProviders.some((candidate) => candidate.id === provider)
        window.location.assign(await (saml ? session.signInSaml(provider, callbackURL) : session.signInSocial(provider, callbackURL)))
      },
      linkProvider: async (provider) => {
        window.location.assign(await session.account.linkProvider(provider, new URL(withoutSignInLink(window.location.href), window.location.href).href))
      },
      personalMail,
      linkPersonalMail: async (link) => {
        window.location.assign(await session.account.linkPersonalMail(link, new URL(withoutSignInLink(window.location.href), window.location.href).href))
      },
      connectAccount: async (connection) => {
        window.location.assign(await session.account.connectAccount(connection, new URL(withoutSignInLink(window.location.href), window.location.href).href))
      },
      stopStaffSession: async () => {
        generation.current += 1
        await push.forget()
        await session.staff.stop()
        setState(signedOutState())
      },
      // Push goes first, while the token can still remove the device; it waits only briefly, then the session ends.
      signOut: async () => {
        generation.current += 1
        await push.turnOff()
        await session.signOut()
        setState(signedOutState())
      },
      // The server removed the account's devices with it, so push is only forgotten here.
      deleteAccount: async (password) => {
        await session.deleteAccount(password)
        generation.current += 1
        await push.forget()
        setState(signedOutState())
      },
      push,
    }),
    [push, state, session, signInMethods, signInFirst, passwordReset, changeEmail, accountDeletion, mcp, personalAccessTokens, canSignUp, passkeyDomains, socialProviders, platformSignIn, personalMail, samlProviders, staffSignIn, organizations, anonymous, beforeSignIn, locale, identity, signedOutState, markSignedOut, recheck, finish, signIn],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
