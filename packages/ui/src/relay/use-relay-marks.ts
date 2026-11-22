import type { NavRecentModel, ViewModel } from '@protobase/schema'
import type { NavRecord, RecordMark } from '../app-shell/nav'
import { text } from '../app-shell/messages'
import { useTypingChannels } from './relay-context'
import { useUnreadCounts } from './use-unread-counts'

const conversationOf = (view: ViewModel) => (view.record && 'conversation' in view.record ? view.record.conversation : undefined)

/**
 * The sidebar's marks of a group's records from the relay, as its `nav.recent` asks: bold with the count of unread
 * messages (`unread`), and "typing…" while someone else types in it (`typing`), but in the one open. Undefined for a group that asks for neither.
 */
export const relayMarks = (view: ViewModel, recent: NavRecentModel) => {
  if (!recent.typing && !recent.unread) return
  const page = recent.unread ? conversationOf(view) : undefined
  return (records: readonly NavRecord[]): Record<string, RecordMark> | undefined => {
    const typing = useTypingChannels()
    const unread = useUnreadCounts(view.resource, page, records.map((record) => record.id))
    const marks: Record<string, RecordMark> = {}
    for (const record of records) {
      const count = unread?.[record.id] ?? 0
      // The open conversation's own line says who types there, so its row does not.
      const typed = recent.typing && !record.active && typing.has(`${view.resource}/${record.id}`)
      if (count === 0 && !typed) continue
      marks[record.id] = { ...(count > 0 && { strong: true, count, label: text('unread', { count }) }), ...(typed && { typing: true }) }
    }
    return marks
  }
}

/** Two marks hooks as one: the second's mark of a record over the first's, field by field. */
export const mergeMarks = (first: ((records: readonly NavRecord[]) => Record<string, RecordMark> | undefined) | undefined, second: ((records: readonly NavRecord[]) => Record<string, RecordMark> | undefined) | undefined) => {
  if (!first || !second) return first ?? second
  return (records: readonly NavRecord[]) => {
    const a = first(records)
    const b = second(records)
    if (!a || !b) return a ?? b
    const merged = { ...a }
    for (const [key, mark] of Object.entries(b)) {
      const label = [a[key]?.label, mark.label].filter(Boolean).join(', ')
      merged[key] = { ...a[key], ...mark, ...(label && { label }) }
    }
    return merged
  }
}
