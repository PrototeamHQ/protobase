import { useEffect, useState } from 'react'
import { tokenExpiry } from '@protobase/client'
import { useAuth } from './auth-provider'

/** Asks for the token again this long before it expires; the session hands out a fresh one by then. */
const refreshLeadMs = 30_000

/** How long until the hook reads `token` again: shortly before it expires, and never sooner than a second. */
export const tokenRefreshDelay = (token: string, now = Date.now()) => Math.max(1000, tokenExpiry(token) - now - refreshLeadMs)

/**
 * The signed-in user's API token (a JWT from `/api/auth/token`), for calling another service as them. It changes
 * before it expires, re-rendering the component; `undefined` while it loads and when nobody is signed in.
 */
export const useApiToken = () => {
  const { state, session } = useAuth()
  const signedIn = state.kind === 'signed-in'
  const [token, setToken] = useState<string>()

  useEffect(() => {
    if (!signedIn) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async (previous?: string) => {
      const value = await session.token()
      // The session still had the old one cached: ask it for a new one.
      const fresh = value !== undefined && value === previous ? await session.token({ refresh: true }) : value
      if (!active) return
      setToken(fresh)
      if (fresh) timer = setTimeout(() => void read(fresh), tokenRefreshDelay(fresh))
    }
    void read()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [session, signedIn])

  return signedIn ? token : undefined
}
