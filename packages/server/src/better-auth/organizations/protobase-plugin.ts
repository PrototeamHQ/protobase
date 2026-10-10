import type { BetterAuthPlugin } from 'better-auth'
import { invitationEndpoints, invitationLinkHook } from './invitation-endpoints'
import { memberEndpoints } from './member-endpoints'
import type { ResolvedOrganizations } from './options'

/**
 * Protobase's endpoints beside Better Auth's organization plugin: invitation links that also make accounts, app roles,
 * handing ownership over, and finding organizations for people with a global role. Without a mailer, whoever invites
 * gets the link in the answer.
 */
export const protobaseOrganizationPlugin = ({ resolved, mail }: { resolved: ResolvedOrganizations; mail: boolean }) =>
  ({
    id: 'protobase-organizations',
    endpoints: { ...invitationEndpoints({ resolved, mail }), ...memberEndpoints({ resolved }) },
    hooks: { after: mail ? [] : [invitationLinkHook(resolved)] },
  }) satisfies BetterAuthPlugin
