import { isRecordCondition, type LayoutItemModel } from '@protobase/schema'
import { whenShown } from './record-mode'

/** The items with a record condition in `when`, whose conditions the page evaluates. */
export const conditionalItems = (items: LayoutItemModel[]) => items.filter((item) => isRecordCondition(item.when))

/**
 * The items that show: those with a record condition only when it holds (`held`, one answer per conditional item in
 * order, `undefined` while loading) and the page is no preview; the others by the form or read view.
 */
export const shownLayout = (items: LayoutItemModel[], held: Array<boolean | undefined>, editing: boolean, preview: boolean) => {
  let next = 0
  return items.filter((item) => {
    if (!isRecordCondition(item.when)) return whenShown(item.when, editing)
    return !preview && held[next++] === true
  })
}
