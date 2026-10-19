import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { AccountSection, SectionError } from '../account/account-section'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import type { PagedSearch } from './use-paged-search'

export type PagedSearchListProps<Item> = {
  title: string
  description: string
  /** The search box's accessible name, such as "Find an organization". */
  searchLabel: string
  placeholder: string
  query: string
  onQuery: (query: string) => void
  list: PagedSearch<Item>
  error?: string
  /** One `<li>` per item. */
  renderRow: (item: Item) => ReactNode
}

/** A section with a search box, how many of how many show, the rows found so far and "Show more" for the next page. */
export const PagedSearchList = <Item,>({ title, description, searchLabel, placeholder, query, onQuery, list, error, renderRow }: PagedSearchListProps<Item>) => (
  <AccountSection title={title} description={description}>
    <SectionError message={error} />
    <Input aria-label={searchLabel} placeholder={placeholder} value={query} onChange={(event) => onQuery(event.target.value)} leading={<Search className="size-3.5" />} wrapperClassName="mb-2" />
    <p className="mb-3 text-xs text-muted-foreground">{list.found.length} of {list.total}</p>
    {list.found.length > 0 && <ul className="divide-y rounded-md border">{list.found.map(renderRow)}</ul>}
    {list.found.length < list.total && <Button className="mt-3" loading={list.loading} onClick={() => void list.more()}>Show more</Button>}
  </AccountSection>
)
