import type { AuthContext } from '../organizations/store'
import { sessionRoles, type RoleSession, type RoleUser } from '../roles/session-role'
import { grantReference } from './grant-reference'

/**
 * The `referenceId` of a consent given from `session`: the role the session acts with, as its next token would carry
 * it, and its active organization. The session's own `activeRole` is not enough: one that never switched role has none.
 */
export const consentReference = async (context: AuthContext, { user, session }: { user: RoleUser; session: RoleSession }) =>
  grantReference({ role: (await sessionRoles(context, { user, session })).active, organization: session.activeOrganizationId ?? undefined })
