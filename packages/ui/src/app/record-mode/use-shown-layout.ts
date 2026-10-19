import type { LayoutItemModel } from '@protobase/schema'
import { useConditions } from '../pages/use-conditions'
import type { LayoutRecord } from '../pages/record-scope'
import { conditionalItems, shownLayout, whenOf } from './shown-layout'

/**
 * The layout items to draw: those meant for the form or the read view as the page is, and those with a record
 * condition while it holds for the saved record. Conditional items stay out while their values load and on a preview.
 */
export const useShownLayout = (items: LayoutItemModel[], scope: LayoutRecord, editing: boolean, preview: boolean) => {
  const conditions = preview ? [] : conditionalItems(items).map((item) => whenOf(item) as string)
  const held = useConditions(conditions, scope)
  return shownLayout(items, held, editing, preview)
}
