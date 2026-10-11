import { createContext, useContext, type ReactNode } from 'react'
import type { ListDisplayRow } from './list-displays'

/** The rows a list display draws: the list page loads them through the list API, with its filter, search and order. */
export type ListDisplay = {
  resource: string
  rows: ListDisplayRow[]
  /** How many records match, as the server counts them. */
  total: number
  loading: boolean
  error: Error | null
  /** Whether more rows can be loaded with `loadMore`. */
  more: boolean
  loadMore: () => void
}

const ListDisplayContext = createContext<ListDisplay | undefined>(undefined)

export const ListDisplayProvider = ({ value, children }: { value: ListDisplay; children: ReactNode }) => <ListDisplayContext.Provider value={value}>{children}</ListDisplayContext.Provider>

/**
 * The list a custom display (`d.custom`) draws. The list page owns the rows, the address and the data: a display never
 * fetches its list, changes the address or keeps its own history.
 */
export const useListDisplay = () => {
  const display = useContext(ListDisplayContext)
  if (!display) throw new Error('useListDisplay is used inside a list display, which the list page draws')
  return display
}

/** The list display around a component, or `undefined` outside one. */
export const useOptionalListDisplay = () => useContext(ListDisplayContext)
