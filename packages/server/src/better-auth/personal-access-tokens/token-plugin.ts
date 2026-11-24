import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { everyRow, type AuthContext } from '../organizations/store'
import type { RoleDefinitions } from '../organizations/role-definitions'
import { sessionRoles, type RoleSession, type RoleUser } from '../roles/session-role'
import type { PersonalAccessTokensOptions } from './options'
import { newToken, tokenHash } from './token-format'
import type { BetterAuthNames } from '../names/better-auth-names'
import type { PinRead } from '../organizations/kept-organizations'
import type { ResolvedNames } from '../names/resolve-names'
import { storeSqlOf } from '../store/store-sql'
import { storePinnedToken } from './pinned-tokens'
import { deleteToken, listedToken, personalAccessTokenModel, storeToken, tokensOf, type PersonalAccessTokenRow } from './token-store'

/** The paths of the account's tokens, as Better Auth names them under the auth base path. */
export const personalAccessTokenPaths = {
  list: '/account/personal-access-tokens',
  create: '/account/personal-access-tokens/create',
  revoke: '/account/personal-access-tokens/revoke',
}

/** The longest a token may be set to last; leaving the expiry out makes one that never expires. */
export const maxTokenDays = 3650

const dayMs = 24 * 60 * 60 * 1000

const noRole = { code: 'NO_ROLE', message: 'You have no role in this app here, so a token could do nothing.' }

const noOrganization = { code: 'NO_ORGANIZATION', message: 'Choose the organization the token works in first.' }

const idsIn = (values: string[]) => [{ field: 'id', value: values, operator: 'in' as const }]

// The role and organization labels of the rows: the role's label, and each organization by its name.
const labelsFor = async (adapter: AuthContext['adapter'], definitions: RoleDefinitions, rows: PersonalAccessTokenRow[]) => {
  const organizationIds = [...new Set(rows.flatMap((row) => (row.organizationId ? [row.organizationId] : [])))]
  const organizations = organizationIds.length === 0 ? [] : await adapter.findMany<{ id: string; name: string }>({ model: 'organization', where: idsIn(organizationIds), limit: everyRow })
  const names = new Map(organizations.map((organization) => [organization.id, organization.name]))
  return { role: (role: string) => definitions.labels[role] ?? role, organization: (id: string) => names.get(id) ?? id }
}

/**
 * The signed-in person's personal access tokens, which act as them from a script:
 * `GET /account/personal-access-tokens` lists them, newest first, without the tokens themselves;
 * `POST /account/personal-access-tokens/create { name, expiresInDays? }` makes one with the role and organization the
 * session works with, and answers the token, once, beside the listed entry; with `organizations`, a session without an
 * active organization makes none, as every token works in one; with `pinned`, while organizations are off after being
 * on, every token is made in the organization `pin` reads, in its column as `kept` names it, which the account page
 * does not name;
 * `POST /account/personal-access-tokens/revoke { id }` deletes one, so it stops at its next request; one that is gone
 * already is no error. Each acts on the session's own person only. The store keeps each token's SHA-256 hash alone.
 */
export const personalAccessTokensPlugin = ({ options, definitions, names, organizations, pinned }: { options: PersonalAccessTokensOptions; definitions: RoleDefinitions; names: BetterAuthNames; organizations: boolean; pinned?: { pin: PinRead; kept: ResolvedNames } }) => {
  const shown = (row: PersonalAccessTokenRow): PersonalAccessTokenRow => (organizations ? row : { ...row, organizationId: null })
  return {
    id: 'protobase-personal-access-tokens',
    schema: names.tables(personalAccessTokenModel),
    endpoints: {
      listPersonalAccessTokens: createAuthEndpoint(personalAccessTokenPaths.list, { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const rows = (await tokensOf(ctx.context.adapter, ctx.context.session.user.id)).map(shown)
        const labels = await labelsFor(ctx.context.adapter, definitions, rows)
        return ctx.json({ tokens: rows.map((row) => listedToken(row, labels)) })
      }),

      createPersonalAccessToken: createAuthEndpoint(
        personalAccessTokenPaths.create,
        { method: 'POST', use: [sessionMiddleware], body: z.object({ name: z.string().trim().min(1).max(100), expiresInDays: z.number().int().min(1).max(maxTokenDays).optional() }) },
        async (ctx) => {
          const { user, session } = ctx.context.session as { user: RoleUser; session: RoleSession & { id: string } }
          if (organizations && !session.activeOrganizationId) throw new APIError('FORBIDDEN', noOrganization)
          const context = ctx.context as unknown as AuthContext
          const { active } = await sessionRoles(context, { user, session })
          if (!active) throw new APIError('FORBIDDEN', noRole)
          const token = newToken(options.prefix)
          const now = new Date()
          const data = {
            userId: user.id,
            name: ctx.body.name,
            tokenHash: await tokenHash(token),
            role: active,
            organizationId: session.activeOrganizationId ?? null,
            createdAt: now,
            expiresAt: ctx.body.expiresInDays === undefined ? null : new Date(now.getTime() + ctx.body.expiresInDays * dayMs),
          }
          const pin = await pinned?.pin()
          const row = pin ? await storePinnedToken(storeSqlOf(ctx.context), pinned!.kept, { ...data, organizationId: pin.id }) : await storeToken(ctx.context.adapter, data)
          const labels = await labelsFor(ctx.context.adapter, definitions, [shown(row)])
          return ctx.json({ token, personalAccessToken: listedToken(shown(row), labels) })
        },
      ),

      revokePersonalAccessToken: createAuthEndpoint(
        personalAccessTokenPaths.revoke,
        { method: 'POST', use: [sessionMiddleware], body: z.object({ id: z.string().min(1) }) },
        async (ctx) => {
          await deleteToken(ctx.context.adapter, ctx.context.session.user.id, ctx.body.id)
          return ctx.json({ revoked: true })
        },
      ),
    },
  } satisfies BetterAuthPlugin
}
