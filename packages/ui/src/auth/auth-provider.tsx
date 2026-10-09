import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createAuthSession, type AuthSession, type AuthUser } from '@protobase/client'

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'needs-admin' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; user: AuthUser }
  | { kind: 'error'; message: string }

export type AuthApi = {
  state: AuthState
  session: AuthSession
  /** The server can email reset links, so the sign-in page offers "Forgot password?". */
  passwordReset: boolean
  /** Rejects with `AuthError`, for the form to show. */
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  /** The API said 401 twice: back to the sign-in page. */
  markSignedOut: () => void
  /** Reads the setup status and session again, for "Check again". */
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
  const [passwordReset, setPasswordReset] = useState(false)
  const markSignedOut = useCallback(() => setState((current) => (current.kind === 'signed-in' ? { kind: 'signed-out' } : current)), [])
  const signedOut = useRef(markSignedOut)
  signedOut.current = markSignedOut
  const session = useMemo(() => given ?? createAuthSession({ onSignedOut: () => signedOut.current() }), [given])

  const recheck = useCallback(() => {
    setState({ kind: 'loading' })
    void session.status().then(async (status) => {
      setPasswordReset(status.passwordReset)
      if (status.needsAdmin) return setState({ kind: 'needs-admin' })
      const user = await session.session()
      setState(user ? { kind: 'signed-in', user } : { kind: 'signed-out' })
    }, (error: unknown) => setState({ kind: 'error', message: error instanceof Error ? error.message : 'The server did not answer' }))
  }, [session])

  useEffect(recheck, [recheck])

  const api = useMemo<AuthApi>(
    () => ({
      state,
      session,
      passwordReset,
      markSignedOut,
      recheck,
      signIn: async (email, password) => {
        setState({ kind: 'signed-in', user: await session.signIn(email, password) })
      },
      signOut: async () => {
        await session.signOut()
        setState({ kind: 'signed-out' })
      },
    }),
    [state, session, passwordReset, markSignedOut, recheck],
  )
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
