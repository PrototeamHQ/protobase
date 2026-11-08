import { createContext, useContext } from 'react'
import type { FocusSize } from './bar-size'
import type { FocusStore, FocusZone } from './focus-store'

/** The elements a focus page keeps for its parts, null until drawn. */
export type FocusHosts = Partial<Record<FocusZone | 'notice' | 'start' | 'end', HTMLElement | null>>

export const FocusContext = createContext<{ store: FocusStore; hosts: FocusHosts; size: FocusSize } | undefined>(undefined)

export const useFocusParts = () => {
  const value = useContext(FocusContext)
  if (!value) throw new Error('A focus part is used outside a FocusPage')
  return value
}

/** The focus page around the caller, with how much room its bar has, or `undefined` on any other page. */
export const useFocusPage = () => {
  const value = useContext(FocusContext)
  return value && { size: value.size }
}
