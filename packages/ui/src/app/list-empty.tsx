import type { ReactNode } from 'react'
import { Button } from '../primitives/button'
import type { ListEmptyState } from './list-empty-state'

type ListEmptyProps = { state: ListEmptyState; onClearSearch: () => void; onClearFilters: () => void; create: ReactNode }

/** A list without rows: why (see `listEmptyState`), with buttons to clear its search or filters, or its New button. */
export const ListEmpty = ({ state, onClearSearch, onClearFilters, create }: ListEmptyProps) => (
  <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
    <p>{state.message}</p>
    {(state.clearSearch || state.clearFilters || (state.create && create)) && (
      <div className="flex flex-wrap justify-center gap-2">
        {state.clearSearch && <Button onClick={onClearSearch}>Clear search</Button>}
        {state.clearFilters && <Button onClick={onClearFilters}>Clear filters</Button>}
        {state.create && create}
      </div>
    )}
  </div>
)
