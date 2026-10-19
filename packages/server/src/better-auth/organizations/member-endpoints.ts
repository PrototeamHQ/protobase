import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { checkAppRoleChange, effectiveRoles, globalRoles } from './app-roles'
import type { ResolvedOrganizations } from './options'
import { superuserRole } from './role-definitions'
import { findMember, findMemberById, findOrganization, organizationRoleOf, setAppRoles, type StoredOrganization } from './store'

const memberNotFound = { code: 'MEMBER_NOT_FOUND', message: 'There is no such member.' }

const pageSize = 20

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
   * `GET /organization/current`: the organization the session works in, with the caller's organization role and app
   * roles there (none for someone with a global role who is not a member) and their global roles; `null` for none.
   */
  currentOrganization: createAuthEndpoint('/organization/current', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
    const { user, session } = ctx.context.session
    const global = globalRoles(user.role as string | null | undefined)
    const organizationId = (session as { activeOrganizationId?: string | null }).activeOrganizationId
    const organization = organizationId ? await findOrganization(ctx.context.adapter, organizationId) : null
    if (!organization) return ctx.json({ organization: null, globalRoles: global })
    const member = await findMember(ctx.context.adapter, { organizationId: organization.id, userId: user.id })
    if (!member && global.length === 0) return ctx.json({ organization: null, globalRoles: global })
    const { id, name, slug, logo } = organization
    return ctx.json({ organization: { id, name, slug, logo: logo ?? null }, ...(member && { role: organizationRoleOf(member), appRoles: member.appRoles, memberId: member.id }), globalRoles: global })
  }),

  /**
   * `GET /organization/search?query=&offset=`, for someone with a global role, who may work in any organization: every
   * organization by slug, a page at a time, narrowed by the text in its name or slug, with the total.
   */
  searchOrganizations: createAuthEndpoint('/organization/search', { method: 'GET', use: [sessionMiddleware], query: z.object({ query: z.string().default(''), offset: z.coerce.number().int().min(0).default(0) }) }, async (ctx) => {
    if (globalRoles(ctx.context.session.user.role as string | null | undefined).length === 0) {
      throw new APIError('FORBIDDEN', { code: 'GLOBAL_ROLE_REQUIRED', message: 'Only people with a global role can open organizations they are not a member of.' })
    }
    const text = ctx.query.query.trim()
    const where = text
      ? [
          { field: 'name', operator: 'contains' as const, value: text, connector: 'OR' as const },
          { field: 'slug', operator: 'contains' as const, value: text, connector: 'OR' as const },
        ]
      : undefined
    // Slugs are unique, so pages never skip or repeat organizations that share a name
    const organizations = await ctx.context.adapter.findMany<StoredOrganization>({ model: 'organization', where, sortBy: { field: 'slug', direction: 'asc' }, limit: pageSize, offset: ctx.query.offset })
    const total = await ctx.context.adapter.count({ model: 'organization', where })
    return ctx.json({ organizations: organizations.map(({ id, name, slug }) => ({ id, name, slug })), total })
  }),
})
