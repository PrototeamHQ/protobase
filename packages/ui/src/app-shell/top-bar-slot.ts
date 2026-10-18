import { createContext, useContext } from 'react'

/**
 * The place in the top bar, below `md`, where a page puts what a mobile screen needs at hand, such as a record's actions
 * menu, portalled into it; null until the top bar is drawn, and in a shell without one.
 */
export const TopBarSlotContext = createContext<HTMLElement | null>(null)

/** The top bar's place for the calling page's own controls on a mobile screen, or null when there is none. */
export const useTopBarSlot = () => useContext(TopBarSlotContext)
