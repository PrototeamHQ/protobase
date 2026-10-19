import { isRecordCondition, type LayoutItemModel } from '@protobase/schema'
import { whenShown } from './record-mode'

/** The items with a record condition in `when`, those inside groups too, whose conditions the page evaluates: a group before its items. */
export const conditionalItems = (items: LayoutItemModel[]) =>
  items.flatMap((item): LayoutItemModel[] => (item.kind === 'group' ? [item, ...item.items] : [item])).filter((item) => isRecordCondition(item.when))

/**
 * The items that show: those with a record condition only when it holds (`held`, one answer per conditional item in
 * the order `conditionalItems` lists them, `undefined` while loading) and the page is no preview; the others by the
 * form or read view. A group keeps the items inside it that show, and goes when it or all of them do not.
 */
export const shownLayout = (items: LayoutItemModel[], held: Array<boolean | undefined>, editing: boolean, preview: boolean) => {
  let next = 0
  const shown = (item: { when?: LayoutItemModel['when'] }) => (isRecordCondition(item.when) ? !preview && held[next++] === true : whenShown(item.when, editing))
  return items.flatMap((item): LayoutItemModel[] => {
    if (item.kind !== 'group') return shown(item) ? [item] : []
    const groupShown = shown(item)
    const inner = item.items.filter(shown)
    return groupShown && inner.length > 0 ? [{ ...item, items: inner }] : []
  })
}
