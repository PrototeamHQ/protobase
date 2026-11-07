/**
 * How much room a focus page's bar has, by its own width and not the screen's, since the sidebar and a right panel take
 * theirs: `wide` shows everything, `medium` shortens the state, `narrow` moves named actions into "...", and `compact`
 * leaves what must stay: the status, the primary action, the unsaved signal and "...".
 */
export type FocusSize = 'wide' | 'medium' | 'narrow' | 'compact'

export const barSize = (width: number): FocusSize => {
  if (width >= 1100) return 'wide'
  if (width >= 950) return 'medium'
  if (width >= 720) return 'narrow'
  return 'compact'
}

/** The least width the surface keeps beside a panel; with less room the panel lies over its edge. */
export const surfaceFloor = 480

/** The width of a side panel. */
export const panelWidth = 380

/** Whether a panel lies over the surface's edge in a row `width` wide, rather than narrowing it. */
export const panelOverlays = (width: number) => width > 0 && width - panelWidth < surfaceFloor
