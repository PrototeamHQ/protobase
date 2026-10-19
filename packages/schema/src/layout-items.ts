import type { LayoutItemModel } from './model'

/** The layout's items with every tab's and group's items in its place, for code that looks for items wherever they sit. */
export const layoutItems = (layout: readonly LayoutItemModel[]): LayoutItemModel[] =>
  layout.flatMap((item) => (item.kind === 'group' || item.kind === 'tab' ? layoutItems(item.items) : [item]))
