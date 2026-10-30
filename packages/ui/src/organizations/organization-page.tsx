import { useEffect, useState } from 'react'
import type { CurrentOrganization, OrganizationMember } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { Switch } from '../primitives/switch'
import { useClient } from '../data/api-provider'
import { useMeta } from '../data/use-meta'
import { managesOrganization, organizationRoleLabel } from './organization-paths'
import { useAction } from './use-action'
import { reopenIn } from './use-organizations'
import { text } from './messages'

type Organization = NonNullable<CurrentOrganization['organization']>

const Details = ({ organization, editable, onSaved }: { organization: Organization; editable: boolean; onSaved: () => void }) => {
  const { session } = useAuth()
  const [name, setName] = useState(organization.name)
  const [slug, setSlug] = useState(organization.slug)
  const { busy, error, run } = useAction()
  const changed = name.trim() !== organization.name || slug !== organization.slug
  return (
    <AccountSection title={text('details')} description={editable ? text('detailsEditable') : text('detailsReadOnly')}>
      <SectionError message={error} />
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void run(async () => { await session.organizations.rename(organization.id, { name: name.trim(), slug }); onSaved() }) }}>
        <Input aria-label={text('name')} value={name} disabled={!editable} onChange={(event) => setName(event.target.value)} wrapperClassName="flex-1" />
        <Input aria-label={text('slug')} value={slug} disabled={!editable} onChange={(event) => setSlug(event.target.value)} wrapperClassName="sm:w-48" />
        {editable && <Button type="submit" variant="primary" loading={busy} disabled={!changed || !name.trim()}>{text('save')}</Button>}
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
    <AccountSection title={text('handOver')} description={text('handOverDescription')}>
      <SectionError message={error} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select aria-label={text('newOwner')} value={target} onChange={(event) => setTarget(event.target.value)} className="h-8 flex-1 rounded-md border border-border-strong bg-background px-2">
          <option value="">{text('chooseMember')}</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}
        </select>
        <Button loading={busy} disabled={!target} onClick={() => void run(async () => { await session.organizations.transferOwnership(target); window.location.reload() })}>{text('handOver')}</Button>
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
    <AccountSection title={text('deleteOrganization')} description={text('deleteDescription')}>
      <SectionError message={confirming ? undefined : error} />
      <Button variant="danger" onClick={() => setConfirming(true)}>{text('deleteOrganization')}</Button>
      {confirming && (
        <Dialog
          title={text('deleteTitle', { name: organization.name })}
          description={text('deleteConfirm')}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button onClick={() => setConfirming(false)}>{text('cancel')}</Button>
              <Button variant="danger" loading={busy} disabled={typed !== organization.name} onClick={() => void remove()}>{text('delete')}</Button>
            </>
          }
        >
          <SectionError message={error} />
          <Input aria-label={text('organizationName')} value={typed} onChange={(event) => setTyped(event.target.value)} />
        </Dialog>
      )}
    </AccountSection>
  )
}

// Whether the organization's calls take guests, which its owner and admins turn on and off; only in an app with calls.
const GuestLinks = ({ editable }: { editable: boolean }) => {
  const client = useClient()
  const [allowed, setAllowed] = useState<boolean>()
  const { busy, error, run } = useAction()
  useEffect(() => {
    void client.callGuests.allowed().then(setAllowed)
  }, [client])
  if (allowed === undefined) return null
  return (
    <AccountSection title={text('guestLinks')} description={text('guestLinksDescription')}>
      <SectionError message={error} />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Switch
          checked={allowed}
          label={text('guestLinksAllowed')}
          {...(editable && !busy && { onChange: (next: boolean) => void run(async () => { await client.callGuests.setAllowed(next); setAllowed(next) }) })}
        />
        {text('guestLinksAllowed')}
      </label>
    </AccountSection>
  )
}

const Leave = ({ organization, basePath, owner }: { organization: Organization; basePath: string; owner: boolean }) => {
  const { session } = useAuth()
  const { busy, error, run } = useAction()
  return (
    <AccountSection title={text('leave')} description={owner ? text('leaveOwner') : text('leaveMember')}>
      <SectionError message={error} />
      <Button loading={busy} onClick={() => void run(async () => { await session.organizations.leave(organization.id); reopenIn(basePath) })}>{text('leaveName', { name: organization.name })}</Button>
    </AccountSection>
  )
}

/**
 * The organization one works in: its details, whether its calls take guests, and handing it over, leaving and deleting
 * it, as one's role allows.
 */
export const OrganizationPage = ({ current, basePath, onChanged }: { current?: CurrentOrganization; basePath: string; onChanged: () => void }) => {
  const calls = useMeta().data?.calls === true
  const organization = current?.organization
  if (!organization) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
        <PageHeader title={text('organization')} subtitle={text('noOrganization')} />
      </div>
    )
  }
  const owner = current.role === 'owner'
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title={organization.name} subtitle={current.role ? text('youAre', { role: organizationRoleLabel(current.role).toLowerCase() }) : text('throughGlobalRoles')} />
      <Details key={`${organization.name}/${organization.slug}`} organization={organization} editable={managesOrganization(current)} onSaved={onChanged} />
      {calls && current.role && <GuestLinks editable={managesOrganization(current)} />}
      {owner && current.memberId && <HandOver organization={organization} memberId={current.memberId} />}
      {current.role && <Leave organization={organization} basePath={basePath} owner={owner} />}
      {owner && <Delete organization={organization} basePath={basePath} />}
    </div>
  )
}
