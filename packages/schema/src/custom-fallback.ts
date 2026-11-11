import type { LayoutItemModel } from './model'

/**
 * Whether a custom section may fall back to `item`: in the main column any main-column item, another custom section
 * included; in the sidebar a sidebar map or another sidebar custom section.
 */
export const fitsFallback = (item: LayoutItemModel, sidebar: boolean) => {
  if (sidebar) return (item.kind === 'map' || item.kind === 'custom') && item.sidebar === true
  return item.kind !== 'sidebar' && item.kind !== 'tab' && !((item.kind === 'map' || item.kind === 'custom') && item.sidebar)
}

/** How an error names an item a fallback refuses. */
export const fallbackItemName = (item: LayoutItemModel) => {
  if (item.kind === 'map' || item.kind === 'custom') return `a ${item.sidebar ? 'sidebar' : 'main-column'} ${item.kind === 'map' ? 'map' : 'custom component'}`
  return item.kind
}
