import type { BetterAuthPlugin } from 'better-auth'
import { invitationEndpoints } from '../invitations/invitation-endpoints'
import { invitationLinkHook } from '../invitations/invitation-link-hook'
import type { ResolvedOrganizations } from '../organizations/options'
import type { SignInPolicy } from '../sign-in-policy'
import { userEndpoints, type UserEndpointsOptions } from './user-endpoints'

/**
 * Managing people without the command line: invitations to the app and the roles to give, for admins, and the endpoints
 * every invitation link opens, to the app or, with `organizations`, to one of them. Without a mailer, whoever invites
 * gets the link in the answer.
 */
export const usersPlugin = (options: UserEndpointsOptions & { organizations?: ResolvedOrganizations; defaultPolicy: SignInPolicy }) =>
  ({
    id: 'protobase-users',
    endpoints: {
      ...userEndpoints(options),
      ...invitationEndpoints({ mail: Boolean(options.mail), defaultPolicy: options.defaultPolicy, ...(options.organizations && { organizations: options.organizations }) }),
    },
    hooks: { after: options.mail ? [] : [invitationLinkHook(['/users/invite'], options.invitationUrl)] },
  }) satisfies BetterAuthPlugin
