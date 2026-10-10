import { useCallback, useEffect, useState } from 'react'
import { AuthError, type CurrentOrganization, type OrganizationMember, type OrganizationRole } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { authMessage } from '../auth/auth-messages'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { AppRolesPicker } from './app-roles-picker'
import { grantableRoles, organizationRoleLabels } from './organization-paths'
import { useAction } from './use-action'

/** The organization roles the person may set: owners every one, admins those below owner. */
export const assignableOrganizationRoles = (current?: CurrentOrganization): OrganizationRole[] => (current?.role === 'owner' ? ['owner', 'admin', 'member'] : ['admin', 'member'])

const MemberRow = ({ member, current, onChanged }: { member: OrganizationMember; current: CurrentOrganization; onChanged: () => void }) => {
  const { session, organizations } = useAuth()
  const organizationId = current.organization!.id
  const { busy, error, run } = useAction()
  const roles = organizations?.roles ?? []
  const self = member.id === current.memberId
  const organizationRoles = assignableOrganizationRoles(current)
  // Only an owner changes an owner, as the server checks too.
  const roleLocked = member.role === 'owner' && current.role !== 'owner'
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{member.name}{self && ' (you)'}</span>
          <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
        </span>
        <select
          aria-label={`Organization role of ${member.name}`}
          value={member.role}
          disabled={busy || roleLocked}
          onChange={(event) => void run(async () => { await session.organizations.setRole(organizationId, member.id, event.target.value as OrganizationRole); onChanged() })}
          className="h-7 rounded-md border border-border-strong bg-background px-2 text-xs"
        >
          {(roleLocked ? [member.role] : organizationRoles).map((role) => <option key={role} value={role}>{organizationRoleLabels[role]}</option>)}
        </select>
        {!self && (
          <Button size="sm" variant="danger" loading={busy} disabled={roleLocked} onClick={() => void run(async () => { await session.organizations.removeMember(organizationId, member.id); onChanged() })}>
            Remove
          </Button>
        )}
      </div>
      <AppRolesPicker roles={roles} selected={member.appRoles} grantable={grantableRoles(roles, current)} disabled={busy} onChange={(selected) => void run(async () => { await session.organizations.setAppRoles(member.id, selected); onChanged() })} />
      <SectionError message={error} />
    </li>
  )
}

/**
 * The members of the organization one works in, for its owners and admins: organization roles, which decide who
 * manages it, and app roles, which decide what each sees and does; only roles the person may give can change.
 */
export const MembersPage = ({ current }: { current?: CurrentOrganization }) => {
  const { session } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>()
  const [error, setError] = useState<string>()
  const organizationId = current?.organization?.id
  const load = useCallback(() => {
    if (organizationId) void session.organizations.members(organizationId).then(setMembers, (failure: unknown) => setError(failure instanceof AuthError ? authMessage(failure) : 'Could not read the members'))
  }, [session, organizationId])
  useEffect(load, [load])
  if (!current?.organization) return null
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title="Members" subtitle={`Who works in ${current.organization.name}, and with which roles.`} />
      <AccountSection title="Members" description="Owners and admins manage the organization; app roles decide what each member sees and does in the app.">
        <SectionError message={error} />
        {members ? (
          <ul className="divide-y rounded-md border">
            {members.map((member) => <MemberRow key={`${member.id}/${member.role}/${member.appRoles.join()}`} member={member} current={current} onChanged={load} />)}
          </ul>
        ) : (
          !error && <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Spinner /> Loading</div>
        )}
      </AccountSection>
    </div>
  )
}
