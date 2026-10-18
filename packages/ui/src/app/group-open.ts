import type { GroupModel } from '@protobase/schema'

/** The open groups after the person opens or closes `title`. */
export const toggledOpen = (open: readonly string[] = [], title: string) => (open.includes(title) ? open.filter((name) => name !== title) : [...open, title])

/** Whether a group shows its items: always unless `collapsed`, else when the address names it or one of its sections holds a field that needs the person's attention. */
export const groupOpen = (group: GroupModel, open: readonly string[] = [], needsAttention: (field: string) => boolean) =>
  !group.collapsed || open.includes(group.title) || group.items.some((item) => item.kind === 'section' && item.fields.some(needsAttention))
