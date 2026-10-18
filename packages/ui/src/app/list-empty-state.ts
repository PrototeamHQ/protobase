export type ListEmptyInput = {
  /** The list's plural name, for example "Companies". */
  plural: string
  /** The search text, or `''` without a search. */
  search: string
  /** Filters of the filter panel are set. */
  filtered: boolean
  /** Something else narrows the list, such as a saved list's scope, which no button here can clear. */
  scoped: boolean
  /** The user may create a record from the list. */
  canCreate: boolean
}

/** Why a list has no rows, and the buttons that help: clear the search, clear the filters, or create the first record. */
export const listEmptyState = ({ plural, search, filtered, scoped, canCreate }: ListEmptyInput) => {
  const noun = plural.toLowerCase()
  if (search) return { message: `No ${noun} match “${search}”.`, clearSearch: true, clearFilters: filtered, create: false }
  if (filtered) return { message: `No ${noun} match these filters.`, clearSearch: false, clearFilters: true, create: false }
  if (scoped) return { message: `No ${noun} match.`, clearSearch: false, clearFilters: false, create: false }
  return { message: `No ${noun} yet.`, clearSearch: false, clearFilters: false, create: canCreate }
}

export type ListEmptyState = ReturnType<typeof listEmptyState>
