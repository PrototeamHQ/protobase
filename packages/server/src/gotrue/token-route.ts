import { Hono } from 'hono'
import * as z from 'zod'
import { address, readBody } from './request-body'
import { takeAuthCode } from './auth-codes'
import { GoTrueError } from './errors'
import { callBetterAuth, signedInToken } from './forward'
import type { GoTrueDeps } from './deps'

const passwordGrant = z.object({ email: address, password: z.string().min(1) })
const refreshGrant = z.object({ refresh_token: z.string().min(1) })
const pkceGrant = z.object({ auth_code: z.string().min(1), code_verifier: z.string().min(1) })

/**
 * `POST /token?grant_type=…`: a session for a password (`password`, through Better Auth's own sign-in, with its rate
 * limit and sign-in policy), for the refresh token of one (`refresh_token`), or for the code a provider's sign-in
 * handed back with its PKCE verifier (`pkce`).
 */
export const tokenRoute = ({ auth, context, sessionOf }: GoTrueDeps) =>
  new Hono().post('/token', async (c) => {
    const grant = c.req.query('grant_type')
    if (grant === 'password') {
      const { json } = await callBetterAuth(auth, c.req.raw, '/sign-in/email', await readBody(c.req.raw, passwordGrant))
      return c.json(await sessionOf(signedInToken(json)))
    }
    if (grant === 'refresh_token') {
      const { refresh_token } = await readBody(c.req.raw, refreshGrant)
      return c.json(await auth.api.goTrueRefresh({ body: { refreshToken: refresh_token } }))
    }
    if (grant === 'pkce') {
      const { auth_code, code_verifier } = await readBody(c.req.raw, pkceGrant)
      const ctx = await context()
      const userId = await takeAuthCode(ctx, auth_code, code_verifier)
      const session = await ctx.internalAdapter.createSession(userId)
      return c.json(await sessionOf(session.token))
    }
    throw new GoTrueError(400, 'unsupported_grant_type', 'Supported grant types are password, refresh_token and pkce')
  })
