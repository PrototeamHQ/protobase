import { APIError } from 'better-auth/api'
import { invitationOfToken as organizationInvitationOfToken, type StoredInvitation } from '../organizations/accept-invitation'
import type { AuthContext } from '../organizations/store'
import { findAppInvitation, type AppInvitation } from '../users/app-invitation-store'
import { invalidInvitation, invitationIdOf, verifyInvitationToken } from './invitation-token'

/** What an invitation link's token names: an invitation to the app itself, or, with organizations, to one of them. */
export type TokenInvitation = { kind: 'app'; invitation: AppInvitation } | { kind: 'organization'; invitation: StoredInvitation }

/** The pending invitation an emailed link's token names, either kind, or a 400 `INVITATION_INVALID`. */
export const invitationOfToken = async (context: AuthContext, token: string, { organizations }: { organizations: boolean }): Promise<TokenInvitation> => {
  const id = invitationIdOf(token)
  const app = id ? await findAppInvitation(context, id) : undefined
  if (app) {
    if (!(await verifyInvitationToken(context.secret, token, app))) throw new APIError('BAD_REQUEST', invalidInvitation)
    return { kind: 'app', invitation: app }
  }
  if (!organizations) throw new APIError('BAD_REQUEST', invalidInvitation)
  return { kind: 'organization', invitation: await organizationInvitationOfToken(context, token) }
}
