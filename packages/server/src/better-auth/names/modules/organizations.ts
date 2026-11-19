import { field, own, type ModuleDeclaration } from '../declaration'

/** Organizations, their members and invitations, and the organization each user, session and token works in. */
export const organizations = {
  id: 'organizations',
  requires: ['auth'],
  tables: {
    organization: {
      model: 'organization',
      scope: 'global',
      columns: { name: field('name'), slug: field('slug'), logo: field('logo'), created_at: field('createdAt'), metadata: field('metadata') },
      indexes: ['organization_created_at_id_idx'],
    },
    member: {
      model: 'member',
      scope: 'organization',
      columns: {
        organization_id: field('organizationId'),
        user_id: field('userId'),
        role: field('role'),
        created_at: field('createdAt'),
        app_roles: own('appRoles', { type: 'string[]', required: false, defaultValue: [], input: false }),
      },
      indexes: ['member_organization_id_idx', 'member_user_id_idx'],
    },
    invitation: {
      model: 'invitation',
      scope: 'organization',
      columns: {
        organization_id: field('organizationId'),
        email: field('email'),
        role: field('role'),
        status: field('status'),
        expires_at: field('expiresAt'),
        created_at: field('createdAt'),
        inviter_id: field('inviterId'),
        app_roles: own('appRoles', { type: 'string[]', required: false, defaultValue: [], input: true }),
      },
      indexes: ['invitation_organization_id_idx', 'invitation_email_idx'],
    },
  },
  columns: {
    user: { last_organization_id: own('lastOrganizationId', { type: 'string', required: false, input: false }) },
    session: { active_organization_id: field('activeOrganizationId') },
    // A token keeps the organization of the session that made it.
    personal_access_token: { organization_id: own('organizationId', { type: 'string', required: false }) },
  },
} as const satisfies ModuleDeclaration
