import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createAuthSession, type AuthSession, type AuthUser, type RequiredSetup, type SignInMethod, type SignInResult, type TwoFactorMethod } from '@protobase/client'

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'needs-admin' }
  | { kind: 'signed-out' }
  /** The password or emailed code was right; the account's second step is next. */
  | { kind: 'two-factor'; methods: TwoFactorMethod[] }
  /** Signed in, but the sign-in policy requires something the account has not set up; no API token until it has. */
  | { kind: 'setup-required'; user: AuthUser; missing: RequiredSetup[] }
  | { kind: 'signed-in'; user: AuthUser }
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
  /** Leaves for the provider's sign-in, which comes back to this page; rejects with `AuthError`. */
  signInSocial: (provider: string) => Promise<void>
  signOut: () => Promise<void>
  /** The API said 401 twice: back to the sign-in page. Signing in again shows what the account has to set up, if anything. */
  markSignedOut: () => void
  /** Reads the setup status and session again, for "Check again" and after setting up a required method. */
  recheck: () => void
}

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
  const markSignedOut = useCallback(() => setState((current) => (current.kind === 'signed-in' ? { kind: 'signed-out' } : current)), [])
  const signedOut = useRef(markSignedOut)
  signedOut.current = markSignedOut
  const session = useMemo(() => given ?? createAuthSession({ onSignedOut: () => signedOut.current() }), [given])

  // Signed in: the app opens unless the policy requires something the account lacks.
  const enter = useCallback(
    async (user: AuthUser) => {
      const { missing } = await session.account.signInMethods()
      setState(missing.length > 0 ? { kind: 'setup-required', user, missing } : { kind: 'signed-in', user })
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
      markSignedOut,
      recheck,
      signIn: async (email, password) => finish(await session.signIn(email, password)),
      sendSignInCode: (email) => session.sendSignInCode(email),
      signInWithCode: async (email, code) => finish(await session.signInWithCode(email, code)),
      signInWithPasskey: async () => enter(await session.signInWithPasskey()),
      verifyTwoFactor: async (input) => enter(await session.verifyTwoFactor(input)),
      signInSocial: async (provider) => {
        window.location.assign(await session.signInSocial(provider, window.location.href))
      },
      signOut: async () => {
        await session.signOut()
        setState({ kind: 'signed-out' })
      },
    }),
    [state, session, signInMethods, passwordReset, socialProviders, markSignedOut, recheck, finish, enter],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
