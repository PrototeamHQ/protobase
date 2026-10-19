import { useCallback, useState } from 'react'
import { useAuth } from '../auth/auth-provider'
import { PagedSearchList } from '../lists/paged-search-list'
import { usePagedSearch } from '../lists/use-paged-search'
import { OrganizationRow } from './organization-row'
import { useAction } from './use-action'
import { reopenIn } from './use-organizations'

/** Every organization in the app for people with a global role, who may work in any of them. */
export const AllOrganizations = ({ basePath, currentId }: { basePath: string; currentId?: string }) => {
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const search = useCallback((text: string, offset: number) => session.organizations.search(text, offset).then((page) => ({ items: page.organizations, total: page.total })), [session])
  const list = usePagedSearch(search, query)
  const { busy, error, run } = useAction()
  return (
    <PagedSearchList
      title="All organizations"
      description="Every organization in the app. Your global roles let you work in any of them, with what those roles allow there. Opening one you are not a member of is written to the audit log."
      searchLabel="Find an organization"
      placeholder="Name or slug"
      query={query}
      onQuery={setQuery}
      list={list}
      error={error}
      renderRow={(organization) => (
        <OrganizationRow key={organization.id} organization={organization} current={organization.id === currentId} busy={busy} onOpen={() => void run(async () => { await session.organizations.switchTo(organization.id); reopenIn(basePath) })} />
      )}
    />
  )
}
