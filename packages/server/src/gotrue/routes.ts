import { Hono } from 'hono'
import type { AdminAuth } from '../better-auth/create-auth'
import { goTrueDeps } from './deps'
import { emailCodeRoutes } from './email-code-routes'
import { asGoTrueError, errorBody, GoTrueError } from './errors'
import { goTrueKeys } from './keys'
import { providerRoutes } from './provider-routes'
import { tokenRoute } from './token-route'
import { userRoutes } from './user-routes'

/**
 * GoTrue's endpoints over Better Auth, for `supabase.auth` and `@supabase/ssr`, to mount at `goTruePath`: sign-in by
 * password, emailed code or a sign-in provider, sign-up with an emailed code, refresh, the user and sign-out, and the
 * keys of the access tokens at `/.well-known/jwks.json`. Every step is Better Auth's own, with its rate limits and the
 * app's sign-in policy; refusals are GoTrue's JSON.
 */
export const goTrueRoutes = (auth: AdminAuth) => {
  const deps = goTrueDeps(auth)
  const app = new Hono()
  app.onError((error, c) => {
    const refusal = asGoTrueError(error)
    if (!(refusal instanceof GoTrueError)) throw error
    return c.json(errorBody(refusal), refusal.status as 400)
  })
  app.get('/.well-known/jwks.json', async (c) => c.json(goTrueKeys(await auth.api.getJwks())))
  app.route('/', tokenRoute(deps))
  app.route('/', emailCodeRoutes(deps))
  app.route('/', userRoutes(deps))
  app.route('/', providerRoutes(deps))
  return app
}
