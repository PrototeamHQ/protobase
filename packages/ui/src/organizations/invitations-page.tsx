import { useCallback, useEffect, useState } from 'react'
import type { CurrentOrganization, OrganizationInvitation, OrganizationRole } from '@protobase/client'
import { AccountSection } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth/auth-provider'
import { InviteForm } from '../invitations/invite-form'
import { PendingInvitationRow } from '../invitations/pending-invitation-row'
import { AppRolesPicker } from './app-roles-picker'
import { assignableOrganizationRoles } from './members-page'
import { grantableRoles, organizationRoleLabel, roleLabel } from './organization-paths'
import { text } from './messages'

const InviteToOrganization = ({ current, onSent }: { current: CurrentOrganization; onSent: () => void }) => {
  const { session, organizations } = useAuth()
  const roles = organizations?.roles ?? []
  const [role, setRole] = useState<OrganizationRole>('member')
  const [appRoles, setAppRoles] = useState<string[]>([])
  const invite = async (email: string) => {
    const sent = await session.organizations.invite(current.organization!.id, { email, role, appRoles })
    setAppRoles([])
    onSent()
    return sent
  }
  return (
    <InviteForm
      title={text('inviteSomeone')}
      description={text('inviteDescription')}
      onInvite={invite}
      beside={
        <select aria-label={text('organizationRole')} value={role} onChange={(event) => setRole(event.target.value as OrganizationRole)} className="h-8 rounded-md border border-border-strong bg-background px-2">
          {assignableOrganizationRoles(current).map((option) => <option key={option} value={option}>{organizationRoleLabel(option)}</option>)}
        </select>
      }
    >
      <AppRolesPicker roles={roles.filter((candidate) => candidate.membership)} selected={appRoles} grantable={grantableRoles(roles, current)} onChange={setAppRoles} />
    </InviteForm>
  )
}

const PendingRow = ({ invitation, organizationId, onChanged }: { invitation: OrganizationInvitation; organizationId: string; onChanged: () => void }) => {
  const { session, organizations } = useAuth()
  const appRoles = invitation.appRoles.map((name) => roleLabel(organizations?.roles ?? [], name))
  return (
    <PendingInvitationRow
      email={invitation.email}
      gives={`${organizationRoleLabel(invitation.role)}${appRoles.length > 0 ? ` · ${appRoles.join(', ')}` : ''}`}
      expiresAt={invitation.expiresAt}
      onResend={async () => {
        const sent = await session.organizations.resend(organizationId, invitation)
        onChanged()
        return sent
      }}
      onRevoke={async () => {
        await session.organizations.revoke(invitation.id)
        onChanged()
      }}
    />
  )
}

/** Inviting people to the organization one works in, and the invitations not yet accepted, for its owners and admins. */
export const InvitationsPage = ({ current }: { current?: CurrentOrganization }) => {
  const { session } = useAuth()
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const organizationId = current?.organization?.id
  const load = useCallback(() => {
    if (organizationId) void session.organizations.invitations(organizationId).then((list) => setInvitations(list.filter((invitation) => invitation.status === 'pending')), () => setInvitations([]))
  }, [session, organizationId])
  useEffect(load, [load])
  if (!current?.organization || !organizationId) return null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title={text('invitations')} subtitle={text('peopleInvited', current.organization.name)} />
      <InviteToOrganization current={current} onSent={load} />
      <AccountSection title={text('notAcceptedYet')} description={invitations.length > 0 ? text('sendingAgain') : text('nobodyWaiting')}>
        {invitations.length > 0 && (
          <ul className="divide-y rounded-md border">
            {invitations.map((invitation) => <PendingRow key={invitation.id} invitation={invitation} organizationId={organizationId} onChanged={load} />)}
          </ul>
        )}
      </AccountSection>
    </div>
  )
}
