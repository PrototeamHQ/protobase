import type { ComponentType } from 'react'

/** One thing to pick. `keywords` are other words it is found by, such as "email" for Send mail. */
export type PickerItem = { id: string; title: string; description?: string; keywords?: readonly string[]; icon?: ComponentType<{ className?: string }> }

export type PickerGroup = { title: string; items: readonly PickerItem[] }

const holds = (text: string, words: readonly string[]) => words.every((word) => text.includes(word))

const found = (item: PickerItem, words: readonly string[]) => holds([item.title, item.description ?? '', ...(item.keywords ?? [])].join(' ').toLowerCase(), words)

// What `query` says by name comes before what it only meets in a description
const named = (item: PickerItem, words: readonly string[]) => holds(item.title.toLowerCase(), words)

/**
 * The groups with what `query` finds, every word of it in an item's title, description or keywords, those it names by
 * title first, in the groups that hold one first; a group left empty goes.
 */
export const matchingGroups = (groups: readonly PickerGroup[], query: string): PickerGroup[] => {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...groups]
  const left = groups.flatMap((group) => {
    const items = group.items.filter((item) => found(item, words))
    return items.length > 0 ? [{ ...group, items: [...items.filter((item) => named(item, words)), ...items.filter((item) => !named(item, words))] }] : []
  })
  const naming = (group: PickerGroup) => named(group.items[0]!, words)
  return [...left.filter(naming), ...left.filter((group) => !naming(group))]
}
