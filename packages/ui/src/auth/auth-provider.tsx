import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createAuthSession, type AuthSession, type AuthUser, type PlatformSignIn, type RequiredSetup, type SetupStatus, type SignInMethod, type SignInResult, type StaffSignIn, type TwoFactorMethod } from '@protobase/client'
import { providerName, withoutSignInLink } from './provider-link'

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'needs-admin' }
  | { kind: 'signed-out' }
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
  /** Each sign-in step rejects with `AuthError`, for the form to show. */
  signIn: (email: string, password: string) => Promise<void>
  sendSignInCode: (email: string) => Promise<void>
  signInWithCode: (email: string, code: string) => Promise<void>
  signInWithPasskey: () => Promise<void>
  /** The second step, while `state` is `two-factor`. */
  verifyTwoFactor: (input: { method: TwoFactorMethod | 'backup'; code: string; trustDevice?: boolean }) => Promise<void>
  /** The ids of the server's sign-in providers, for example `github`. */
  socialProviders: string[]
  /** The server's sign-in providers with the names to show, the platform's own included. */
  signInProviders: SignInProvider[]
  /** Leaves for the provider's sign-in, which comes back to this page; rejects with `AuthError`. */
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
  /** Reads the setup status and session again, for "Check again" and after setting up a required method. */
  recheck: () => void
}

/** A sign-in provider as the app offers it: its id and its name. */
export type SignInProvider = { id: string; name: string }

const AuthContext = createContext<AuthApi | null>(null)

export const useAuth = () => {
  const api = useContext(AuthContext)
  if (!api) throw new Error('useAuth must be used inside AuthProvider')
  return api
}

/** Finds out whether the server has a login and who is signed in, and keeps that state for the app. */
export const AuthProvider = ({ session: given, children }: { session?: AuthSession; children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({ kind: 'loading' })
  const [signInMethods, setSignInMethods] = useState<SignInMethod[]>(['password'])
  const [passwordReset, setPasswordReset] = useState(false)
  const [socialProviders, setSocialProviders] = useState<string[]>([])
  const [platformSignIn, setPlatformSignIn] = useState<PlatformSignIn>()
  const [staffSignIn, setStaffSignIn] = useState<string>()
  const [organizations, setOrganizations] = useState<SetupStatus['organizations']>()
  const markSignedOut = useCallback(() => setState((current) => (current.kind === 'signed-in' ? { kind: 'signed-out' } : current)), [])
  const signedOut = useRef(markSignedOut)
  signedOut.current = markSignedOut
  const session = useMemo(() => given ?? createAuthSession({ onSignedOut: () => signedOut.current() }), [given])

  // Signed in: the app opens unless the policy requires something the account lacks, which it never does for staff.
  const enter = useCallback(
    async (user: AuthUser) => {
      const [{ missing }, staff] = await Promise.all([session.account.signInMethods(), session.staff.current()])
      setState(missing.length > 0 ? { kind: 'setup-required', user, missing } : { kind: 'signed-in', user, ...(staff && { staff }) })
    },
    [session],
  )

  const finish = useCallback(async (result: SignInResult) => (result.kind === 'two-factor' ? setState({ kind: 'two-factor', methods: result.methods }) : enter(result.user)), [enter])

  const recheck = useCallback(() => {
    setState({ kind: 'loading' })
    void session.status().then(async (status) => {
      setSignInMethods(status.signInMethods)
      setPasswordReset(status.passwordReset)
      setSocialProviders(status.socialProviders)
      setPlatformSignIn(status.platformSignIn)
      setStaffSignIn(status.staffSignIn)
      setOrganizations(status.organizations)
      if (status.needsAdmin) return setState({ kind: 'needs-admin' })
      const user = await session.session()
      return user ? enter(user) : setState({ kind: 'signed-out' })
    }).catch((error: unknown) => setState({ kind: 'error', message: error instanceof Error ? error.message : 'The server did not answer' }))
  }, [session, enter])

  useEffect(recheck, [recheck])

  const api = useMemo<AuthApi>(
    () => ({
      state,
      session,
      signInMethods,
      passwordReset,
      socialProviders,
      signInProviders: socialProviders.map((id) => ({ id, name: providerName(id, platformSignIn) })),
      staffSignIn,
      ...(organizations && { organizations }),
      markSignedOut,
      recheck,
      signIn: async (email, password) => finish(await session.signIn(email, password)),
      sendSignInCode: (email) => session.sendSignInCode(email),
      signInWithCode: async (email, code) => finish(await session.signInWithCode(email, code)),
      signInWithPasskey: async () => enter(await session.signInWithPasskey()),
      verifyTwoFactor: async (input) => enter(await session.verifyTwoFactor(input)),
      // The provider comes back to this page without a link's marker, so it does not start again.
      signInSocial: async (provider) => {
        window.location.assign(await session.signInSocial(provider, new URL(withoutSignInLink(window.location.href), window.location.href).href))
      },
      linkProvider: async (provider) => {
        window.location.assign(await session.account.linkProvider(provider, new URL(withoutSignInLink(window.location.href), window.location.href).href))
      },
      stopStaffSession: async () => {
        await session.staff.stop()
        setState({ kind: 'signed-out' })
      },
      signOut: async () => {
        await session.signOut()
        setState({ kind: 'signed-out' })
      },
    }),
    [state, session, signInMethods, passwordReset, socialProviders, platformSignIn, staffSignIn, organizations, markSignedOut, recheck, finish, enter],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
