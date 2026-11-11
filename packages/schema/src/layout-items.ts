import type { LayoutItemModel } from './model'

/**
 * The layout's items with every tab's and group's items in its place, and a custom section's fallback after it, for code
 * that looks for items wherever they sit.
 */
export const layoutItems = (layout: readonly LayoutItemModel[]): LayoutItemModel[] =>
  layout.flatMap((item) => {
    if (item.kind === 'group' || item.kind === 'tab') return layoutItems(item.items)
    if (item.kind === 'custom') return [item, ...layoutItems(item.fallback ?? [])]
    return [item]
  })
