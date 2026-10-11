import { createAuthSession, type AuthSession } from '@protobase/client'

declare global {
  interface Window {
    /** The page's sign-in session against the origin it was loaded from. */
    auth: AuthSession
  }
}

window.auth = createAuthSession()
