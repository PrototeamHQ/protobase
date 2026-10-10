import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { checkAppRoleChange, effectiveRoles, globalRoles } from './app-roles'
import type { ResolvedOrganizations } from './options'
import { superuserRole } from './role-definitions'
import { findMember, findMemberById, organizationRoleOf, setAppRoles, type StoredOrganization } from './store'

const memberNotFound = { code: 'MEMBER_NOT_FOUND', message: 'There is no such member.' }

const searchLimit = 20

/**
 * Protobase's member endpoints beside Better Auth's: changing a member's app roles, handing ownership over in one step,
 * and, for people with a global role, finding any organization to work in.
 */
export const memberEndpoints = ({ resolved }: { resolved: ResolvedOrganizations }) => ({
  /**
   * `POST /organization/set-app-roles` with `{ memberId, appRoles }`, by the organization's owners and admins, or a
   * superuser: only roles the caller may give change (`checkAppRoleChange`).
   */
  setAppRoles: createAuthEndpoint(
    '/organization/set-app-roles',
    { method: 'POST', use: [sessionMiddleware], body: z.object({ memberId: z.string().min(1), appRoles: z.array(z.string()) }) },
    async (ctx) => {
      const { adapter } = ctx.context
      const { user } = ctx.context.session
      const target = await findMemberById(adapter, ctx.body.memberId)
      if (!target) throw new APIError('BAD_REQUEST', memberNotFound)
      const actor = await findMember(adapter, { organizationId: target.organizationId, userId: user.id })
      const global = globalRoles(user.role as string | null | undefined)
      const manages = global.includes(superuserRole) || (actor !== undefined && organizationRoleOf(actor) !== 'member')
      if (!manages) throw new APIError('FORBIDDEN', { code: 'NOT_AN_ORGANIZATION_ADMIN', message: "Only the organization's owners and admins can change members' roles." })
      const after = [...new Set(ctx.body.appRoles)]
      const refusal = checkAppRoleChange({ held: effectiveRoles(global, actor?.appRoles), before: target.appRoles, after, definitions: resolved.definitions })
      if (refusal) throw new APIError(refusal.status, { code: refusal.code, message: refusal.message })
      await setAppRoles(adapter, target.id, after)
      return ctx.json({ member: { ...target, appRoles: after } })
    },
  ),

  /**
   * `POST /organization/transfer-ownership` with `{ memberId, keepAs? }`, by an owner: in one transaction the member
   * becomes owner and the caller `keepAs` (`admin` unless `member`). App roles stay as they are.
   */
  transferOwnership: createAuthEndpoint(
    '/organization/transfer-ownership',
    { method: 'POST', use: [sessionMiddleware], body: z.object({ memberId: z.string().min(1), keepAs: z.enum(['admin', 'member']).optional() }) },
    async (ctx) => {
      const { adapter } = ctx.context
      const target = await findMemberById(adapter, ctx.body.memberId)
      if (!target) throw new APIError('BAD_REQUEST', memberNotFound)
      const actor = await findMember(adapter, { organizationId: target.organizationId, userId: ctx.context.session.user.id })
      if (!actor || organizationRoleOf(actor) !== 'owner') throw new APIError('FORBIDDEN', { code: 'NOT_THE_OWNER', message: 'Only an owner can hand the organization over.' })
      if (actor.id === target.id) throw new APIError('BAD_REQUEST', { code: 'ALREADY_THE_OWNER', message: 'Choose another member to hand the organization over to.' })
      await adapter.transaction(async (trx) => {
        await trx.update({ model: 'member', where: [{ field: 'id', value: target.id }], update: { role: 'owner' } })
        await trx.update({ model: 'member', where: [{ field: 'id', value: actor.id }], update: { role: ctx.body.keepAs ?? 'admin' } })
      })
      return ctx.json({ owner: target.id })
    },
  ),

  /**
   * `GET /organization/search?query=`, for someone with a global role, who may work in any organization: the first
   * organizations whose name or slug contains the text, by name.
   */
  searchOrganizations: createAuthEndpoint('/organization/search', { method: 'GET', use: [sessionMiddleware], query: z.object({ query: z.string().default('') }) }, async (ctx) => {
    if (globalRoles(ctx.context.session.user.role as string | null | undefined).length === 0) {
      throw new APIError('FORBIDDEN', { code: 'GLOBAL_ROLE_REQUIRED', message: 'Only people with a global role can open organizations they are not a member of.' })
    }
    const text = ctx.query.query.trim()
    const find = (field: 'name' | 'slug') =>
      ctx.context.adapter.findMany<StoredOrganization>({
        model: 'organization',
        ...(text && { where: [{ field, value: text, operator: 'contains' as const }] }),
        sortBy: { field: 'name', direction: 'asc' },
        limit: searchLimit,
      })
    const found = new Map([...(await find('name')), ...(text ? await find('slug') : [])].map((organization) => [organization.id, organization]))
    const organizations = [...found.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, searchLimit)
    return ctx.json({ organizations: organizations.map(({ id, name, slug }) => ({ id, name, slug })) })
  }),
})
