import type { LayoutItemModel } from './model'

/**
 * Whether a main-column custom section may fall back to `item`: any main-column item but another custom component,
 * which a client without the first one would have to fall back from again.
 */
export const fitsMainFallback = (item: LayoutItemModel) => item.kind !== 'sidebar' && item.kind !== 'tab' && item.kind !== 'custom' && !(item.kind === 'map' && item.sidebar)

/** How an error names an item a fallback refuses. */
export const fallbackItemName = (item: LayoutItemModel) => {
  if (item.kind === 'map') return `a ${item.sidebar ? 'sidebar' : 'main-column'} map`
  if (item.kind === 'custom') return 'a custom component'
  return item.kind
}
