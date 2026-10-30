import { useEffect, useState } from 'react'
import type { Organization, OrganizationInvitation } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth/auth-provider'
import { isAdmin } from '../auth/user-to-shell'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { AllOrganizations } from './all-organizations'
import { OrganizationRow } from './organization-row'
import { roleLabel } from './organization-paths'
import { useAction } from './use-action'
import { reopenIn, type OrganizationsState } from './use-organizations'
import { formatTag } from '../locale/active-locale'
import { text } from './messages'

/** A slug from a name: lowercase ASCII words joined by dashes, as the server accepts them. */
export const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)

const NewOrganization = ({ basePath }: { basePath: string }) => {
  const { session } = useAuth()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState<string>()
  const { busy, error, run } = useAction()
  const create = () => run(async () => {
    await session.organizations.create({ name: name.trim(), slug: slug ?? slugOf(name) })
    reopenIn(basePath)
  })
  return (
    <AccountSection title={text('newOrganization')} description={text('newOrganizationDescription')}>
      <SectionError message={error} />
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void create() }}>
        <Input aria-label={text('name')} placeholder={text('name')} value={name} onChange={(event) => setName(event.target.value)} wrapperClassName="flex-1" />
        <Input aria-label={text('slug')} placeholder="slug" value={slug ?? slugOf(name)} onChange={(event) => setSlug(event.target.value)} wrapperClassName="sm:w-48" />
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>{text('create')}</Button>
      </form>
    </AccountSection>
  )
}

/** The invitations for the person's own address, each to accept, which opens the app in its organization. */
const YourInvitations = ({ basePath }: { basePath: string }) => {
  const { session, organizations } = useAuth()
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const { busy, error, run } = useAction()
  useEffect(() => {
    void session.organizations.myInvitations().then(setInvitations, () => setInvitations([]))
  }, [session])
  if (invitations.length === 0) return null
  const roles = organizations?.roles ?? []
  const accept = (invitationId: string) => run(async () => {
    await session.organizations.acceptMine(invitationId)
    reopenIn(basePath)
  })
  return (
    <AccountSection title={text('invitationsForYou')} description={text('invitationsForYouDescription')}>
      <SectionError message={error} />
      <ul className="divide-y rounded-md border">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{invitation.organizationName ?? text('anOrganization')}</span>: {invitation.appRoles.map((name) => roleLabel(roles, name)).join(', ') || text('noAppRoles')}
              <span className="block text-xs text-muted-foreground">{text('until', { date: new Date(invitation.expiresAt).toLocaleDateString(formatTag()) })}</span>
            </span>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void accept(invitation.id)}>{text('accept')}</Button>
          </li>
        ))}
      </ul>
    </AccountSection>
  )
}

/**
 * The person's organizations: switching between them, making a new one when the app allows it, and for people with a
 * global role every organization. Someone in none sees their invitations here.
 */
export const OrganizationsPage = ({ state, basePath }: { state: OrganizationsState; basePath: string }) => {
  const { session, organizations: settings, state: auth } = useAuth()
  const { busy, error, run } = useAction()
  const user = auth.kind === 'signed-in' ? auth.user : undefined
  const mayCreate = settings?.create === 'everyone' || (user !== undefined && isAdmin(user))
  const currentId = state.current?.organization?.id
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title={text('organizations')} subtitle={text('organizationsSubtitle')} />
      <AccountSection title={text('yourOrganizations')} description={state.organizations.length > 0 ? text('memberOf') : text('notMember')}>
        <SectionError message={error ?? state.error} />
        {state.organizations.length > 0 && (
          <ul className="divide-y rounded-md border">
            {state.organizations.map((organization) => (
              <OrganizationRow key={organization.id} organization={organization} current={organization.id === currentId} busy={busy} onOpen={() => void run(async () => { await session.organizations.switchTo(organization.id); reopenIn(basePath) })} />
            ))}
          </ul>
        )}
      </AccountSection>
      <YourInvitations basePath={basePath} />
      {mayCreate && <NewOrganization basePath={basePath} />}
      {(state.current?.globalRoles.length ?? 0) > 0 && <AllOrganizations basePath={basePath} currentId={currentId} />}
    </div>
  )
}
