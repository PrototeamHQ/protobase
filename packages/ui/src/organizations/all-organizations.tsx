import { Search } from 'lucide-react'
import { useState } from 'react'
import { AccountSection, SectionError } from '../account/account-section'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { OrganizationRow } from './organization-row'
import { useAction } from './use-action'
import { useAllOrganizations } from './use-all-organizations'
import { reopenIn } from './use-organizations'

/** Every organization in the app for people with a global role, who may work in any of them. */
export const AllOrganizations = ({ basePath, currentId }: { basePath: string; currentId?: string }) => {
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const { found, total, more, loading } = useAllOrganizations(session.organizations, query)
  const { busy, error, run } = useAction()
  return (
    <AccountSection title="All organizations" description="Every organization in the app. Your global roles let you work in any of them, with what those roles allow there. Opening one you are not a member of is written to the audit log.">
      <SectionError message={error} />
      <Input aria-label="Find an organization" placeholder="Name or slug" value={query} onChange={(event) => setQuery(event.target.value)} leading={<Search className="size-3.5" />} wrapperClassName="mb-2" />
      <p className="mb-3 text-xs text-muted-foreground">{found.length} of {total}</p>
      {found.length > 0 && (
        <ul className="divide-y rounded-md border">
          {found.map((organization) => (
            <OrganizationRow key={organization.id} organization={organization} current={organization.id === currentId} busy={busy} onOpen={() => void run(async () => { await session.organizations.switchTo(organization.id); reopenIn(basePath) })} />
          ))}
        </ul>
      )}
      {found.length < total && <Button className="mt-3" loading={loading} onClick={() => void more()}>Show more</Button>}
    </AccountSection>
  )
}
