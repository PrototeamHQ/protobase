import { useEffect, useState } from 'react'
import type { CurrentOrganization, OrganizationMember } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { managesOrganization, organizationRoleLabels } from './organization-paths'
import { useAction } from './use-action'
import { reopenIn } from './use-organizations'

type Organization = NonNullable<CurrentOrganization['organization']>

const Details = ({ organization, editable, onSaved }: { organization: Organization; editable: boolean; onSaved: () => void }) => {
  const { session } = useAuth()
  const [name, setName] = useState(organization.name)
  const [slug, setSlug] = useState(organization.slug)
  const { busy, error, run } = useAction()
  const changed = name.trim() !== organization.name || slug !== organization.slug
  return (
    <AccountSection title="Details" description={editable ? 'The name people see, and the slug that names it in links.' : 'Owners and admins can change these.'}>
      <SectionError message={error} />
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void run(async () => { await session.organizations.rename(organization.id, { name: name.trim(), slug }); onSaved() }) }}>
        <Input aria-label="Name" value={name} disabled={!editable} onChange={(event) => setName(event.target.value)} wrapperClassName="flex-1" />
        <Input aria-label="Slug" value={slug} disabled={!editable} onChange={(event) => setSlug(event.target.value)} wrapperClassName="sm:w-48" />
        {editable && <Button type="submit" variant="primary" loading={busy} disabled={!changed || !name.trim()}>Save</Button>}
      </form>
    </AccountSection>
  )
}

const HandOver = ({ organization, memberId }: { organization: Organization; memberId: string }) => {
  const { session } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [target, setTarget] = useState('')
  const { busy, error, run } = useAction()
  useEffect(() => {
    void session.organizations.members(organization.id).then((list) => setMembers(list.filter((member) => member.id !== memberId)), () => setMembers([]))
  }, [session, organization.id, memberId])
  return (
    <AccountSection title="Hand over" description="Make another member the owner. You stay as an admin.">
      <SectionError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select aria-label="New owner" value={target} onChange={(event) => setTarget(event.target.value)} className="h-8 flex-1 rounded-md border border-border-strong bg-background px-2 text-[13px]">
          <option value="">Choose a member</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}
        </select>
        <Button loading={busy} disabled={!target} onClick={() => void run(async () => { await session.organizations.transferOwnership(target); window.location.reload() })}>Hand over</Button>
      </div>
    </AccountSection>
  )
}

const Delete = ({ organization, basePath }: { organization: Organization; basePath: string }) => {
  const { session } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const { busy, error, run } = useAction()
  const remove = () => run(async () => { await session.organizations.remove(organization.id); reopenIn(basePath) })
  return (
    <AccountSection title="Delete organization" description="Takes the organization and its members and invitations away. Its records must be deleted first.">
      <SectionError message={confirming ? undefined : error} />
      <Button variant="danger" onClick={() => setConfirming(true)}>Delete organization</Button>
      {confirming && (
        <Dialog
          title={`Delete ${organization.name}?`}
          description="Type its name to confirm. This cannot be undone."
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="danger" loading={busy} disabled={typed !== organization.name} onClick={() => void remove()}>Delete</Button>
            </>
          }
        >
          <SectionError message={error} />
          <Input aria-label="Organization name" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </Dialog>
      )}
    </AccountSection>
  )
}

const Leave = ({ organization, basePath, owner }: { organization: Organization; basePath: string; owner: boolean }) => {
  const { session } = useAuth()
  const { busy, error, run } = useAction()
  return (
    <AccountSection title="Leave" description={owner ? 'An organization keeps an owner: hand it over before you leave, unless it has another owner.' : 'You stop being a member, and lose your roles here.'}>
      <SectionError message={error} />
      <Button loading={busy} onClick={() => void run(async () => { await session.organizations.leave(organization.id); reopenIn(basePath) })}>Leave {organization.name}</Button>
    </AccountSection>
  )
}

/** The organization one works in: its details, and handing it over, leaving and deleting it, as one's role allows. */
export const OrganizationPage = ({ current, basePath, onChanged }: { current?: CurrentOrganization; basePath: string; onChanged: () => void }) => {
  const organization = current?.organization
  if (!organization) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
        <PageHeader title="Organization" subtitle="You do not work in an organization now. Choose one under Organizations." />
      </div>
    )
  }
  const owner = current.role === 'owner'
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title={organization.name} subtitle={current.role ? `You are ${organizationRoleLabels[current.role].toLowerCase()} here.` : 'You work here through your global roles, without being a member.'} />
      <Details key={`${organization.name}/${organization.slug}`} organization={organization} editable={managesOrganization(current)} onSaved={onChanged} />
      {owner && current.memberId && <HandOver organization={organization} memberId={current.memberId} />}
      {current.role && <Leave organization={organization} basePath={basePath} owner={owner} />}
      {owner && <Delete organization={organization} basePath={basePath} />}
    </div>
  )
}
