import type { LayoutItemModel } from './model'

/** The layout's items with every group's items in its place, for code that looks for sections and related tables wherever they sit. */
export const layoutItems = (layout: readonly LayoutItemModel[]): LayoutItemModel[] => layout.flatMap((item) => (item.kind === 'group' ? item.items : [item]))
