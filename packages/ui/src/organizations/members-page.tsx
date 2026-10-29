import { useCallback, useEffect, useState } from 'react'
import { AuthError, type CurrentOrganization, type OrganizationMember, type OrganizationRole, type PersonStatus } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { PersonRow } from '../people/person-row'
import { StatusMark } from '../status/status-mark'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { AppRolesPicker } from './app-roles-picker'
import { grantableRoles, organizationRoleLabel } from './organization-paths'
import { useAction } from './use-action'
import { text } from './messages'

/** The organization roles the person may set: owners every one, admins those below owner. */
export const assignableOrganizationRoles = (current?: CurrentOrganization): OrganizationRole[] => (current?.role === 'owner' ? ['owner', 'admin', 'member'] : ['admin', 'member'])

const MemberRow = ({ member, current, status, onChanged }: { member: OrganizationMember; current: CurrentOrganization; status?: PersonStatus | undefined; onChanged: () => void }) => {
  const { session, organizations } = useAuth()
  const organizationId = current.organization!.id
  const { busy, error, run } = useAction()
  const roles = organizations?.roles ?? []
  const self = member.id === current.memberId
  const organizationRoles = assignableOrganizationRoles(current)
  // Only an owner changes an owner, as the server checks too.
  const roleLocked = member.role === 'owner' && current.role !== 'owner'
  const membershipRoles = roles.filter((role) => role.membership)
  return (
    <PersonRow
      name={member.name}
      email={member.email}
      self={self}
      error={error}
      {...(status && { status: <StatusMark status={status} /> })}
      actions={
        <>
          <select
            aria-label={text('roleOf', member.name)}
            value={member.role}
            disabled={busy || roleLocked}
            onChange={(event) => void run(async () => { await session.organizations.setRole(organizationId, member.id, event.target.value as OrganizationRole); onChanged() })}
            className="h-7 rounded-md border border-border-strong bg-background px-2 text-body"
          >
            {(roleLocked ? [member.role] : organizationRoles).map((role) => <option key={role} value={role}>{organizationRoleLabel(role)}</option>)}
          </select>
          {!self && (
            <Button size="sm" variant="danger" loading={busy} disabled={roleLocked} onClick={() => void run(async () => { await session.organizations.removeMember(organizationId, member.id); onChanged() })}>
              {text('remove')}
            </Button>
          )}
        </>
      }
    >
      <AppRolesPicker roles={membershipRoles} selected={member.appRoles} grantable={grantableRoles(roles, current)} disabled={busy} onChange={(selected) => void run(async () => { await session.organizations.setAppRoles(member.id, selected); onChanged() })} />
    </PersonRow>
  )
}

/**
 * The members of the organization one works in, for its owners and admins: organization roles, which decide who
 * manages it, and app roles, which decide what each sees and does; only roles the person may give can change. In an
 * app with status, `statuses` puts each member's beside their name (see `useStatuses`).
 */
export const MembersPage = ({ current, statuses }: { current?: CurrentOrganization; statuses?: readonly PersonStatus[] | undefined }) => {
  const { session } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>()
  const [error, setError] = useState<string>()
  const organizationId = current?.organization?.id
  const load = useCallback(() => {
    if (organizationId) void session.organizations.members(organizationId).then(setMembers, (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : text('couldNotReadMembers')))
  }, [session, organizationId])
  useEffect(load, [load])
  if (!current?.organization) return null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title={text('members')} subtitle={text('whoWorks', current.organization.name)} />
      <AccountSection title={text('members')} description={text('membersDescription')}>
        <SectionError message={error} />
        {members ? (
          <ul className="divide-y rounded-md border">
            {members.map((member) => <MemberRow key={`${member.id}/${member.role}/${member.appRoles.join()}`} member={member} current={current} status={statuses?.find((status) => status.userId === member.userId)} onChanged={load} />)}
          </ul>
        ) : (
          !error && <div className="flex items-center gap-2 text-muted-foreground"><Spinner /> {text('loading')}</div>
        )}
      </AccountSection>
    </div>
  )
}
