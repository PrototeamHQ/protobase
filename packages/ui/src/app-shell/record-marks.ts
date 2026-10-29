import { heldStatus } from '@protobase/schema/internal'
import { text } from '../status/messages'
import { availabilityLabel } from '../status/status-mark'
import type { NavRecord, ShownMark } from './nav'

/** A sidebar record with its mark, when it has one, by its `id`; the records keep their order. */
export type MarkedRecord = NavRecord & { mark?: ShownMark }

export const markRecords = (records: NavRecord[], marks: Record<string, ShownMark> | undefined): MarkedRecord[] =>
  records.map((record) => {
    const mark = marks && Object.hasOwn(marks, record.id) ? marks[record.id] : undefined
    return mark ? { ...record, mark } : record
  })

// The words of a mark's person: online or away, then busy or do not disturb and their text, of a status that holds now.
const personWords = (person: ShownMark['person']) => {
  if (!person) return []
  const held = heldStatus(person.status)
  return [person.presence && text(person.presence), held && held.availability !== 'automatic' ? availabilityLabel(held.availability) : undefined, held?.text ?? undefined]
}

/**
 * What a sidebar record is called for screen readers and in its tooltip: its title, with its status, its person's
 * presence and status, and its mark's label.
 */
export const recordNames = (record: MarkedRecord) => {
  const extra = [record.status?.label, ...personWords(record.mark?.person), record.mark?.label].filter((part) => part !== undefined && part !== '')
  return {
    ariaLabel: [record.label, ...extra].join(', '),
    title: extra.length === 0 ? record.label : `${record.label} (${extra.join(', ')})`,
  }
}
