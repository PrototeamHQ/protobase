import { enumLabel, type FieldModel, type FieldViewModel } from '@protobase/schema'
import { formatDate, formatDateTime } from '../format/date'
import { fileShown } from './file-values'

/** A read-only rendering of a stored value, following the view's prefix, decimals, format and value label hints. */
export const displayValue = (field: FieldModel, value: unknown, hints: FieldViewModel = {}) => {
  if (value === null || value === undefined || value === '') return '—'
  switch (field.type) {
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'file':
      return fileShown(value)?.name ?? '—'
    case 'enum':
      return enumLabel(String(value), hints.valueLabels)
    case 'timestamp':
      return formatDateTime(Date.parse(String(value)))
    case 'date':
      return formatDate(Date.parse(String(value)))
    case 'decimal': {
      const text = hints.decimals === undefined ? String(value) : Number(value).toFixed(hints.decimals)
      if (hints.format === 'percent') return `${Number(value)}%`
      return `${hints.prefix ?? ''}${Number(text).toLocaleString('en-IE', { minimumFractionDigits: hints.decimals ?? 0, maximumFractionDigits: hints.decimals ?? 20 })}`
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
}
