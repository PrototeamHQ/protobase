import type { BetterAuthPlugin } from 'better-auth'
import { invitationLinkHook } from '../invitations/invitation-link-hook'
import { invitationEndpoints } from './invitation-endpoints'
import { memberEndpoints } from './member-endpoints'
import type { ResolvedOrganizations } from './options'

/**
 * Protobase's endpoints beside Better Auth's organization plugin: accepting invitations signed in, app roles, handing
 * ownership over, and finding organizations for people with a global role. Without a mailer, whoever invites gets the
 * link in the answer.
 */
export const protobaseOrganizationPlugin = ({ resolved, mail }: { resolved: ResolvedOrganizations; mail: boolean }) =>
  ({
    id: 'protobase-organizations',
    endpoints: { ...invitationEndpoints({ resolved }), ...memberEndpoints({ resolved }) },
    hooks: { after: mail ? [] : [invitationLinkHook(['/organization/invite-member'], resolved.invitationUrl)] },
  }) satisfies BetterAuthPlugin
