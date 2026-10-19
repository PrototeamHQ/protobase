import { useCallback, useState } from 'react'
import { useAuth } from '../auth/auth-provider'
import { PagedSearchList } from '../lists/paged-search-list'
import { usePagedSearch } from '../lists/use-paged-search'
import { OrganizationRow } from './organization-row'
import { useAction } from './use-action'
import { reopenIn } from './use-organizations'
import { text } from './messages'

/** Every organization in the app for people with a global role, who may work in any of them. */
export const AllOrganizations = ({ basePath, currentId }: { basePath: string; currentId?: string }) => {
  const { session } = useAuth()
  const [query, setQuery] = useState('')
  const search = useCallback((term: string, offset: number) => session.organizations.search(term, offset).then((page) => ({ items: page.organizations, total: page.total })), [session])
  const list = usePagedSearch(search, query)
  const { busy, error, run } = useAction()
  return (
    <PagedSearchList
      title={text('allOrganizations')}
      description={text('allOrganizationsDescription')}
      searchLabel={text('findOrganization')}
      placeholder={text('nameOrSlug')}
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
