import { useCallback, useEffect, useState } from 'react'
import type { RoleLabel, UserInvitation } from '@protobase/client'
import { AccountSection } from '../account/account-section'
import { useAuth } from '../auth/auth-provider'
import { InviteForm } from '../invitations/invite-form'
import { PendingInvitationRow } from '../invitations/pending-invitation-row'
import { AppRolesPicker } from '../organizations/app-roles-picker'
import { roleNames } from './role-names'

/** Inviting someone to the app with the roles their account gets, and the invitations not accepted yet. */
export const AppInvitations = ({ roles }: { roles: readonly RoleLabel[] }) => {
  const { session } = useAuth()
  const [selected, setSelected] = useState<string[]>([])
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const load = useCallback(() => void session.users.invitations().then(setInvitations, () => setInvitations([])), [session])
  useEffect(load, [load])
  const invite = async (email: string) => {
    const sent = await session.users.invite({ email, roles: selected })
    setSelected([])
    load()
    return sent
  }
  return (
    <>
      <InviteForm title="Invite someone" description="They get an email with a link to make their account, with the roles you tick." onInvite={invite} incomplete={selected.length === 0}>
        <AppRolesPicker roles={roles} selected={selected} grantable={new Set(roles.map((role) => role.name))} onChange={setSelected} />
      </InviteForm>
      <AccountSection title="Not accepted yet" description={invitations.length > 0 ? 'Sending again gives a new link, which replaces the earlier one.' : 'Nobody is waiting.'}>
        {invitations.length > 0 && (
          <ul className="divide-y rounded-md border">
            {invitations.map((invitation) => (
              <PendingInvitationRow
                key={invitation.id}
                email={invitation.email}
                gives={roleNames(roles, invitation.roles)}
                expiresAt={invitation.expiresAt}
                onResend={async () => {
                  const sent = await session.users.invite({ email: invitation.email, roles: invitation.roles })
                  load()
                  return sent
                }}
                onRevoke={async () => {
                  await session.users.revoke(invitation.id)
                  load()
                }}
              />
            ))}
          </ul>
        )}
      </AccountSection>
    </>
  )
}
