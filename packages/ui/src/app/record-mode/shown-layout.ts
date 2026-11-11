import { isRecordCondition, type CustomSectionModel, type LayoutItemModel } from '@protobase/schema'
import { whenShown } from './record-mode'

// A custom section's fallback holds items with conditions of their own, as a tab or group does
const innerItems = (item: LayoutItemModel): LayoutItemModel[] => {
  if (item.kind === 'group' || item.kind === 'tab') return item.items
  if (item.kind === 'custom') return item.fallback ?? []
  return []
}

// A tab has no condition: it shows while any of its items does.
export const whenOf = (item: LayoutItemModel) => (item.kind === 'tab' ? undefined : item.when)

/** The items with a record condition in `when`, those inside tabs, groups and fallbacks too, whose conditions the page evaluates: a group before its items. */
export const conditionalItems = (items: LayoutItemModel[]): LayoutItemModel[] =>
  items.flatMap((item) => [item, ...conditionalItems(innerItems(item))]).filter((item) => isRecordCondition(whenOf(item)))

/** A shown custom section: `fallbackAt` holds each shown fallback item's place in the whole fallback. */
type ShownCustom = CustomSectionModel & { fallbackAt?: number[] }

/** A shown custom section's fallback items, each with its place in the whole fallback, which stays as siblings hide and show. */
export const fallbackEntries = (item: ShownCustom) => (item.fallback ?? []).map((entry, index) => [entry, item.fallbackAt?.[index] ?? index] as const)

/**
 * The items that show: those with a record condition only when it holds (`held`, one answer per conditional item in
 * the order `conditionalItems` lists them, `undefined` while loading) and the page is no preview; the others by the
 * form or read view. A tab or group keeps the items inside it that show, and goes when it or all of them do not; a
 * custom section keeps the fallback items that show, `[]` when none does, so it then falls back to nothing, and their
 * places in the whole fallback for `fallbackEntries`.
 */
export const shownLayout = (items: LayoutItemModel[], held: Array<boolean | undefined>, editing: boolean, preview: boolean) => {
  let next = 0
  const shown = (item: LayoutItemModel) => {
    const when = whenOf(item)
    return isRecordCondition(when) ? !preview && held[next++] === true : whenShown(when, editing)
  }
  const keep = (list: LayoutItemModel[]): LayoutItemModel[] =>
    list.flatMap((item) => {
      const itself = shown(item)
      if (item.kind === 'custom' && item.fallback) {
        const kept = item.fallback.map((entry) => keep([entry]))
        const fallbackAt = kept.flatMap((entry, index) => (entry.length > 0 ? [index] : []))
        return itself ? [{ ...item, fallback: kept.flat(), fallbackAt } as LayoutItemModel] : []
      }
      if (item.kind !== 'group' && item.kind !== 'tab') return itself ? [item] : []
      const inner = keep(item.items)
      return itself && inner.length > 0 ? [{ ...item, items: inner } as LayoutItemModel] : []
    })
  return keep(items)
}
