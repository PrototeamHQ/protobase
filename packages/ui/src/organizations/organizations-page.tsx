import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Organization, OrganizationInvitation } from '@protobase/client'
import { AccountSection, SectionError } from '../account/account-section'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth/auth-provider'
import { isAdmin } from '../auth/user-to-shell'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { roleLabel } from './organization-paths'
import { useAction } from './use-action'
import { reopenIn, type OrganizationsState } from './use-organizations'

/** A slug from a name: lowercase ASCII words joined by dashes, as the server accepts them. */
export const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)

const OrganizationRow = ({ organization, current, busy, onOpen }: { organization: Organization; current: boolean; busy: boolean; onOpen: () => void }) => (
  <li className="flex items-center gap-3 px-3 py-2.5">
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-medium">{organization.name}</span>
      <span className="block text-xs text-muted-foreground">{organization.slug}</span>
    </span>
    {current ? <Badge tone="green">Current</Badge> : <Button size="sm" loading={busy} onClick={onOpen}>Open</Button>}
  </li>
)

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
    <AccountSection title="New organization" description="You become its owner, with every role, and work in it once it is made.">
      <SectionError message={error} />
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void create() }}>
        <Input aria-label="Name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} wrapperClassName="flex-1" />
        <Input aria-label="Slug" placeholder="slug" value={slug ?? slugOf(name)} onChange={(event) => setSlug(event.target.value)} wrapperClassName="sm:w-48" />
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>Create</Button>
      </form>
    </AccountSection>
  )
}

const FindOrganization = ({ basePath, currentId }: { basePath: string; currentId?: string }) => {
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Organization[]>([])
  const { busy, error, run } = useAction()
  useEffect(() => {
    const timer = setTimeout(() => void session.organizations.search(query).then(setFound, () => setFound([])), 200)
    return () => clearTimeout(timer)
  }, [session, query])
  return (
    <AccountSection title="Find an organization" description="Your global roles let you work in any organization, with what those roles allow there. Opening one you are not a member of is written to the audit log.">
      <SectionError message={error} />
      <Input aria-label="Find an organization" placeholder="Name or slug" value={query} onChange={(event) => setQuery(event.target.value)} leading={<Search className="size-3.5" />} wrapperClassName="mb-3" />
      {found.length > 0 && (
        <ul className="divide-y rounded-md border">
          {found.map((organization) => (
            <OrganizationRow key={organization.id} organization={organization} current={organization.id === currentId} busy={busy} onOpen={() => void run(async () => { await session.organizations.switchTo(organization.id); reopenIn(basePath) })} />
          ))}
        </ul>
      )}
    </AccountSection>
  )
}

const YourInvitations = () => {
  const { session, organizations } = useAuth()
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  useEffect(() => {
    void session.organizations.myInvitations().then(setInvitations, () => setInvitations([]))
  }, [session])
  if (invitations.length === 0) return null
  const roles = organizations?.roles ?? []
  return (
    <AccountSection title="Invitations for you" description="Open the link in the invitation email to accept one.">
      <ul className="divide-y rounded-md border">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="px-3 py-2.5 text-[13px]">
            <span className="font-medium">{invitation.organizationName ?? 'An organization'}</span>: {invitation.appRoles.map((name) => roleLabel(roles, name)).join(', ') || 'no app roles'}
            <span className="block text-xs text-muted-foreground">Until {new Date(invitation.expiresAt).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </AccountSection>
  )
}

/**
 * The person's organizations: switching between them, making a new one when the app allows it, and for people with a
 * global role finding any organization. Someone in none sees their invitations here.
 */
export const OrganizationsPage = ({ state, basePath }: { state: OrganizationsState; basePath: string }) => {
  const { session, organizations: settings, state: auth } = useAuth()
  const { busy, error, run } = useAction()
  const user = auth.kind === 'signed-in' ? auth.user : undefined
  const mayCreate = settings?.create === 'everyone' || (user !== undefined && isAdmin(user))
  const currentId = state.current?.organization?.id
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
      <PageHeader title="Organizations" subtitle="You work in one organization at a time; what you see follows from your roles there." />
      <AccountSection title="Your organizations" description={state.organizations.length > 0 ? 'The organizations you are a member of.' : 'You are not a member of an organization yet.'}>
        <SectionError message={error ?? state.error} />
        {state.organizations.length > 0 && (
          <ul className="divide-y rounded-md border">
            {state.organizations.map((organization) => (
              <OrganizationRow key={organization.id} organization={organization} current={organization.id === currentId} busy={busy} onOpen={() => void run(async () => { await session.organizations.switchTo(organization.id); reopenIn(basePath) })} />
            ))}
          </ul>
        )}
      </AccountSection>
      <YourInvitations />
      {mayCreate && <NewOrganization basePath={basePath} />}
      {(state.current?.globalRoles.length ?? 0) > 0 && <FindOrganization basePath={basePath} currentId={currentId} />}
    </div>
  )
}
