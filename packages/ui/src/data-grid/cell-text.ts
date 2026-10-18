import { enumLabel } from '@protobase/schema'
import { formatDate, formatDateTime } from '../format/date'
import { formatInt, formatPercent, formatSigned } from '../format/number'
import { formatMoney } from '../format/money'
import { userById } from '../mocks'
import { fileShown } from '../live/file-values'
import type { ColumnSpec } from './column-spec'

/** A relation cell's text: the related record's name when the row carries it, else its key. */
export const relationLabel = (value: unknown) => (typeof value === 'object' && value !== null && 'name' in value ? String(value.name) : String(value))

/** The text a cell of `spec` shows for `value`; `undefined` when it shows only an icon, such as a ticked boolean. */
export const cellText = (spec: ColumnSpec, value: unknown): string | undefined => {
  if (value === null || value === undefined) return '—'
  switch (spec.kind) {
    case 'text':
    case 'id':
      return String(value)
    case 'money':
      return `${formatMoney(Number(value), spec.currency, spec.decimals)}${spec.suffix ?? ''}`
    case 'date':
      return formatDate(Number(value))
    case 'datetime':
      return formatDateTime(Number(value))
    case 'number':
      return `${formatInt(Number(value))}${spec.suffix ?? ''}`
    case 'signed':
      return `${formatSigned(Number(value))}${spec.suffix ?? ''}`
    case 'percent':
      return Number(value) === 0 ? '—' : formatPercent(Number(value))
    case 'status':
      return enumLabel(String(value), spec.labels)
    case 'relation':
      return relationLabel(value)
    case 'boolean':
      return value ? undefined : 'No'
    case 'file':
      return fileShown(value)?.name ?? '—'
    case 'user':
      return userById(String(value)).name
  }
}
