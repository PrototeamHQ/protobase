import { useCallback, useEffect, useState } from 'react'
import type { CurrentOrganization, OrganizationInvitation, OrganizationRole } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AppRolesPicker } from './app-roles-picker'
import { assignableOrganizationRoles } from './members-page'
import { grantableRoles, organizationRoleLabels, roleLabel } from './organization-paths'
import { useAction } from './use-action'

const LinkNotice = ({ link }: { link?: string }) =>
  link ? (
    <p className="mt-3 break-all rounded-md border bg-muted px-3 py-2 text-xs">
      This app cannot send email, so pass this link on yourself. It works once, until the invitation expires: <span className="font-mono">{link}</span>
    </p>
  ) : null

const InviteForm = ({ current, onSent }: { current: CurrentOrganization; onSent: () => void }) => {
  const { session, organizations } = useAuth()
  const roles = organizations?.roles ?? []
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrganizationRole>('member')
  const [appRoles, setAppRoles] = useState<string[]>([])
  const [link, setLink] = useState<string>()
  const { busy, error, run } = useAction()
  const invite = () =>
    run(async () => {
      const sent = await session.organizations.invite(current.organization!.id, { email: email.trim(), role, appRoles })
      setLink(sent.link)
      setEmail('')
      setAppRoles([])
      onSent()
    })
  return (
    <AccountSection title="Invite someone" description="They get an email with a link to join, or to make an account first. You can give the app roles you hold, and those your roles grant.">
      <SectionError message={error} />
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void invite() }}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Email" type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} wrapperClassName="flex-1" />
          <select aria-label="Organization role" value={role} onChange={(event) => setRole(event.target.value as OrganizationRole)} className="h-8 rounded-md border border-border-strong bg-background px-2 text-[13px]">
            {assignableOrganizationRoles(current).map((option) => <option key={option} value={option}>{organizationRoleLabels[option]}</option>)}
          </select>
          <Button type="submit" variant="primary" loading={busy} disabled={!email.trim()}>Invite</Button>
        </div>
        <AppRolesPicker roles={roles} selected={appRoles} grantable={grantableRoles(roles, current)} onChange={setAppRoles} />
      </form>
      <LinkNotice link={link} />
    </AccountSection>
  )
}

const PendingRow = ({ invitation, organizationId, onChanged }: { invitation: OrganizationInvitation; organizationId: string; onChanged: () => void }) => {
  const { session, organizations } = useAuth()
  const [link, setLink] = useState<string>()
  const { busy, error, run } = useAction()
  const expired = new Date(invitation.expiresAt).getTime() < Date.now()
  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{invitation.email}</span>
          <span className="block text-xs text-muted-foreground">
            {organizationRoleLabels[invitation.role]}
            {invitation.appRoles.length > 0 && ` · ${invitation.appRoles.map((name) => roleLabel(organizations?.roles ?? [], name)).join(', ')}`} · {expired ? 'Expired' : `Until ${new Date(invitation.expiresAt).toLocaleDateString()}`}
          </span>
        </span>
        <Button size="sm" loading={busy} onClick={() => void run(async () => { setLink((await session.organizations.resend(organizationId, invitation)).link); onChanged() })}>Send again</Button>
        <Button size="sm" variant="danger" loading={busy} onClick={() => void run(async () => { await session.organizations.revoke(invitation.id); onChanged() })}>Revoke</Button>
      </div>
      <SectionError message={error} />
      <LinkNotice link={link} />
    </li>
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
      <PageHeader title="Invitations" subtitle={`People invited to ${current.organization.name}.`} />
      <InviteForm current={current} onSent={load} />
      <AccountSection title="Not accepted yet" description={invitations.length > 0 ? 'Sending again gives a new link, which replaces the earlier one.' : 'Nobody is waiting.'}>
        {invitations.length > 0 && (
          <ul className="divide-y rounded-md border">
            {invitations.map((invitation) => <PendingRow key={invitation.id} invitation={invitation} organizationId={organizationId} onChanged={load} />)}
          </ul>
        )}
      </AccountSection>
    </div>
  )
}
