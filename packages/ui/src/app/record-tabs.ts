import type { LayoutItemModel, TabModel } from '@protobase/schema'
import { layoutItems } from '@protobase/schema/internal'

/** The shown layout around its tabs: the items before them, the tabs, and the items after. A view's tabs stand together. */
export const splitTabs = (layout: LayoutItemModel[]) => {
  const first = layout.findIndex((item) => item.kind === 'tab')
  if (first === -1) return { before: layout, tabs: [] as TabModel[], after: [] as LayoutItemModel[] }
  const tabs: TabModel[] = []
  for (const item of layout.slice(first)) {
    if (item.kind !== 'tab') break
    tabs.push(item)
  }
  return { before: layout.slice(0, first), tabs, after: layout.slice(first + tabs.length) }
}

/** The tab shown: the one the address names, else the first. */
export const shownTab = (tabs: TabModel[], named: string | undefined) => tabs.find((tab) => tab.title === named) ?? tabs[0]

const tabFields = (tab: TabModel) => layoutItems(tab.items).flatMap((item) => (item.kind === 'section' ? item.fields : []))

/** The tab to show after a turned-down save: the first that holds a field needing attention, unless the shown one does. */
export const attentionTab = (tabs: TabModel[], shown: TabModel | undefined, needsAttention: (field: string) => boolean) => {
  if (!shown || tabFields(shown).some(needsAttention)) return undefined
  return tabs.find((tab) => tabFields(tab).some(needsAttention))
}
