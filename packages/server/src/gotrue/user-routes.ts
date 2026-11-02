import { Hono } from 'hono'
import * as z from 'zod'
import { revokeMcpGrants } from '../better-auth/mcp/revoke-grants'
import { checkNewAccountPassword } from '../better-auth/new-account-password'
import { rejectLeakedPassword } from '../better-auth/leaked-passwords'
import { readSignInPolicy } from '../better-auth/policy-store'
import { effectiveSignInPolicy } from '../better-auth/sign-in-policy'
import { accessClaimsOf, type AccessClaims } from './bearer'
import type { GoTrueDeps } from './deps'
import { GoTrueError } from './errors'
import { goTrueTokens } from './access-tokens'
import { readBody } from './request-body'
import { goTrueUser, userMetadata, type StoredAccount, type StoredUser } from './user-json'

const updateBody = z.object({ email: z.string().optional(), password: z.string().optional(), data: z.record(z.string(), z.unknown()).optional() })

const logoutScopes = ['global', 'local', 'others'] as const

/**
 * The signed-in user's own endpoints, with their access token: `GET /user`, `PUT /user` for a new password or metadata,
 * and `POST /logout`. A token whose session has ended, by signing out or a ban, is GoTrue's `session_not_found`.
 * With MCP on, signing out everywhere or the other sessions disconnects the user's MCP clients, as the same steps do
 * through Better Auth. A new password signs out the other sessions, with the MCP clients, and mails the owner, as a
 * change through Better Auth does: GoTrue has no way to tell a password reset or a first password from a change, so
 * every new password does.
 */
export const userRoutes = ({ auth, context }: GoTrueDeps) => {
  const claimsOf = accessClaimsOf(goTrueTokens({ auth }))

  // The user of a token whose session still exists.
  const signedIn = async (request: Request) => {
    const claims = await claimsOf(request)
    const ctx = await context()
    const session = await ctx.adapter.findOne<{ id: string }>({ model: 'session', where: [{ field: 'id', value: claims.session_id }] })
    const user = session ? ((await ctx.internalAdapter.findUserById(claims.sub)) as StoredUser | null) : null
    if (!user) throw new GoTrueError(403, 'session_not_found', 'Session from session_id claim in JWT does not exist')
    return { claims, user, ctx }
  }

  const userJson = async ({ user, ctx }: Awaited<ReturnType<typeof signedIn>>) =>
    goTrueUser(user, (await ctx.internalAdapter.findAccounts(user.id)) as StoredAccount[])

  // Ends the sessions `scope` names: this one, every one, or every other one of the user.
  const signOut = async (claims: AccessClaims, scope: (typeof logoutScopes)[number]) => {
    const { adapter } = await context()
    const others = { field: 'id', value: claims.session_id, operator: 'ne' } as const
    const where = scope === 'local' ? [{ field: 'id', value: claims.session_id }] : [{ field: 'userId', value: claims.sub }, ...(scope === 'others' ? [others] : [])]
    await adapter.deleteMany({ model: 'session', where })
    if (scope !== 'local' && auth.mcp) await revokeMcpGrants(adapter, claims.sub)
  }

  return new Hono()
    .get('/user', async (c) => c.json(await userJson(await signedIn(c.req.raw))))
    .put('/user', async (c) => {
      const { email, password, data } = await readBody(c.req.raw, updateBody)
      const found = await signedIn(c.req.raw)
      const { user, ctx } = found
      if (email !== undefined && email.trim().toLowerCase() !== user.email) throw new GoTrueError(422, 'email_change_not_allowed', 'Changing the email address is not offered')
      if (data !== undefined && !auth.userMetadata) throw new GoTrueError(400, 'validation_failed', 'This app keeps no user metadata: leave data out')
      if (password !== undefined) {
        checkNewAccountPassword(effectiveSignInPolicy((await readSignInPolicy(ctx.adapter, auth.signInPolicy)).policy, { mail: auth.mail }), password)
        if (auth.leakedPasswords) await rejectLeakedPassword(password)
        const hash = await ctx.password.hash(password)
        const credential = await ctx.internalAdapter.findCredentialAccount(user.id)
        if (credential) await ctx.internalAdapter.updatePassword(user.id, hash)
        else await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash })
        await signOut(found.claims, 'others')
        await auth.api.passwordChanged({ body: { email: user.email } })
      }
      // GoTrue merges the keys given into the metadata; one given as null is removed.
      const merged = data && Object.fromEntries(Object.entries({ ...userMetadata(user.metadata), ...data }).filter(([, value]) => value !== null))
      const updated = merged ? ((await ctx.internalAdapter.updateUser(user.id, { metadata: merged })) as unknown as StoredUser) : user
      return c.json(await userJson({ ...found, user: updated }))
    })
    .post('/logout', async (c) => {
      const scope = c.req.query('scope') ?? 'global'
      if (!logoutScopes.includes(scope as never)) throw new GoTrueError(400, 'validation_failed', 'scope must be global, local or others')
      await signOut(await claimsOf(c.req.raw), scope as (typeof logoutScopes)[number])
      return c.body(null, 204)
    })
}
