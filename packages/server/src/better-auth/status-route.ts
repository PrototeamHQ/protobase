import { Hono } from 'hono'
import type { AdminAuth } from './create-auth'
import { hasUsers } from './users'

/**
 * `GET {authBase}/status`: `needsAdmin` while the admin store has no user, so a login page can say how to create one,
 * `passwordReset` when reset mail can be sent, so it offers "Forgot password?" only then, and the ids of the configured
 * `socialProviders`, so it offers "Continue with GitHub" when `github` is one.
 */
export const statusRoute = (auth: AdminAuth) => {
  const app = new Hono()
  app.get('/status', async (c) => c.json({ needsAdmin: !(await hasUsers(auth)), passwordReset: auth.passwordReset, socialProviders: auth.socialProviders }))
  return app
}
