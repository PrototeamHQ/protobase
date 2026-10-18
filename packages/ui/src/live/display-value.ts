import { enumLabel, type FieldModel, type FieldViewModel } from '@protobase/schema'
import { formatDate, formatDateTime } from '../format/date'
import { viewerZone, zoneLabel } from '../format/zone'
import { fileShown } from './file-values'

// A number with the view's prefix before it and suffix after it, such as `€1,200` or `120 m²`.
const affixed = (text: string, hints: FieldViewModel) => `${hints.prefix ?? ''}${text}${hints.suffix ?? ''}`

/**
 * A read-only rendering of a stored value, following the view's prefix, suffix, decimals, format and value label hints; a
 * timestamp on the clock of `zone`, the viewer's unless given.
 */
export const displayValue = (field: FieldModel, value: unknown, hints: FieldViewModel = {}, zone = viewerZone()) => {
  if (value === null || value === undefined || value === '') return '—'
  switch (field.type) {
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'file':
      return fileShown(value)?.name ?? '—'
    case 'enum':
      return enumLabel(String(value), hints.valueLabels)
    case 'timestamp':
      return formatDateTime(Date.parse(String(value)), zone)
    case 'date':
      return formatDate(Date.parse(String(value)))
    case 'decimal': {
      const text = hints.decimals === undefined ? String(value) : Number(value).toFixed(hints.decimals)
      if (hints.format === 'percent') return `${Number(value)}%`
      return affixed(Number(text).toLocaleString('en-IE', { minimumFractionDigits: hints.decimals ?? 0, maximumFractionDigits: hints.decimals ?? 20 }), hints)
    }
    case 'integer':
    case 'bigint':
      return affixed(String(value), hints)
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
}

/** The hover label of a shown value: the time zone a timestamp is shown in, nothing for other values. */
export const valueTitle = (field: FieldModel, value: unknown, zone = viewerZone()) => {
  if (field.type !== 'timestamp' || typeof value !== 'string') return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : `Shown in ${zoneLabel(ms, zone)}`
}
