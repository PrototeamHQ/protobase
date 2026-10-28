import type { NavRecord, RecordMark } from './nav'

/** A sidebar record with its mark, when it has one, by its `id`; the records keep their order. */
export type MarkedRecord = NavRecord & { mark?: RecordMark }

export const markRecords = (records: NavRecord[], marks: Record<string, RecordMark> | undefined): MarkedRecord[] =>
  records.map((record) => {
    const mark = marks && Object.hasOwn(marks, record.id) ? marks[record.id] : undefined
    return mark ? { ...record, mark } : record
  })

/** What a sidebar record is called for screen readers and in its tooltip: its title, with its status and its mark's label. */
export const recordNames = (record: MarkedRecord) => {
  const extra = [record.status?.label, record.mark?.label].filter((part) => part !== undefined && part !== '')
  return {
    ariaLabel: [record.label, ...extra].join(', '),
    title: extra.length === 0 ? record.label : `${record.label} (${extra.join(', ')})`,
  }
}
