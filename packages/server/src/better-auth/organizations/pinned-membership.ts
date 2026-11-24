import type { BetterAuthPlugin } from 'better-auth'
import type { DBFieldAttribute } from '@better-auth/core/db'
import { APIError, BASE_ERROR_CODES } from '@better-auth/core/error'
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import type { ResolvedNames } from '../names/resolve-names'
import type { PinnedOrganization, PinRead } from './kept-organizations'
import { findMember, type AuthContext } from './store'

// The kept member table while organizations are off after being on: who works in the pinned organization.

type Adapter = AuthContext['adapter']

/** The answer to someone who is no member of the pinned organization, the same as to a wrong password. */
export const notPinnedMember = () => APIError.from('UNAUTHORIZED', BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD)

/**
 * The member table organizations kept, as Better Auth's `member` model, so the pinned organization's members are read
 * and written through the adapter of the request, in its transaction; `kept` names it as organizations on would. While
 * `pin` reads an organization, a session whose user is no member of it, such as one from before organizations were
 * turned off, gets no new credential from `minting`, the paths of API tokens and personal access tokens.
 */
export const pinnedMembershipPlugin = (kept: ResolvedNames, pin: PinRead, minting: readonly string[]) => {
  const member = kept.table('member')
  const field = (name: string, attribute: Omit<DBFieldAttribute, 'fieldName'>) => ({ ...attribute, fieldName: member.fields[name]!.name }) as DBFieldAttribute
  return {
    id: 'protobase-pinned-membership',
    schema: {
      member: {
        modelName: member.name,
        fields: {
          organizationId: field('organizationId', { type: 'string', required: true }),
          userId: field('userId', { type: 'string', required: true }),
          role: field('role', { type: 'string', required: true }),
          createdAt: field('createdAt', { type: 'date', required: true }),
          appRoles: field('appRoles', { type: 'string[]', required: false }),
        },
      },
    },
    hooks: {
      before: [
        {
          matcher: (context) => context.path !== undefined && minting.includes(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const pinned = await pin()
            if (!pinned) return
            const session = await getSessionFromCtx(ctx)
            // Without a session the endpoint's own check answers.
            if (!session) return
            if (!(await isPinnedMember(ctx.context.adapter as Adapter, pinned, session.user.id))) throw notPinnedMember()
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}

/** Whether the user is a member of the pinned organization: `organization_id = pin and user_id = user`. */
export const isPinnedMember = async (adapter: Adapter, pin: PinnedOrganization, userId: string) => (await findMember(adapter, { organizationId: pin.id, userId })) !== undefined

/**
 * Makes someone who joins while organizations are off a member of the pinned organization, as the users there already
 * became one as organizations turned on: the organization role `member`, and `existingUsersRole` as their app role.
 */
export const joinPinned = async (adapter: Adapter, pin: PinnedOrganization, userId: string) => {
  if (await isPinnedMember(adapter, pin, userId)) return
  await adapter.create({
    model: 'member',
    data: { organizationId: pin.id, userId, role: 'member', createdAt: new Date(), appRoles: pin.existingUsersRole === undefined ? [] : [pin.existingUsersRole] },
  })
}
