import { useCallback, useState } from 'react'
import type { RoleLabel } from '@protobase/client'
import { useAuth } from '../auth/auth-provider'
import { PagedSearchList } from '../lists/paged-search-list'
import { usePagedSearch } from '../lists/use-paged-search'
import { UserRow } from './user-row'

/** Everyone who can sign in, a page at a time, found by address; `version` changes to read them again. */
export const UserList = ({ roles, version }: { roles: readonly RoleLabel[]; version: number }) => {
  const { session, state } = useAuth()
  const [query, setQuery] = useState('')
  // A new version is a new search, so the list reads the users again.
  const search = useCallback((text: string, offset: number) => session.users.search(text, offset).then((page) => ({ items: page.users, total: page.total })), [session, version])
  const list = usePagedSearch(search, query)
  const selfId = state.kind === 'signed-in' ? state.user.id : undefined
  return (
    <PagedSearchList
      title="People"
      description="Everyone with an account. Roles decide what each sees and does; someone blocked cannot sign in, and is signed out at once."
      searchLabel="Find someone"
      placeholder="Email address"
      query={query}
      onQuery={setQuery}
      list={list}
      renderRow={(user) => <UserRow key={`${version}/${user.id}`} user={user} roles={roles} self={user.id === selfId} />}
    />
  )
}
