import { enumLabel, type FieldModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import type { BadgeTone } from '../primitives/badge'
import type { ColumnKind, ColumnSpec } from '../data-grid'
import { humanize } from './naming'

const tones: Record<string, BadgeTone> = {
  draft: 'neutral',
  confirmed: 'blue',
  picking: 'amber',
  shipped: 'violet',
  delivered: 'green',
  cancelled: 'red',
  sent: 'blue',
  paid: 'green',
  overdue: 'red',
  lead: 'blue',
  active: 'green',
  dormant: 'neutral',
  receipt: 'green',
  issue: 'blue',
  transfer: 'violet',
  adjustment: 'amber',
}

export const toneFor = (value: string): BadgeTone => tones[value] ?? 'neutral'

const widths: Record<ColumnKind, number> = {
  text: 200,
  id: 140,
  money: 120,
  date: 110,
  datetime: 170,
  status: 150,
  relation: 200,
  boolean: 64,
  number: 100,
  signed: 110,
  percent: 110,
  user: 130,
  file: 180,
}

/** Room for a header at 12px plus cell padding, the sort arrow and the column menu button. */
export const headerWidth = (header: string, sortable: boolean) => Math.ceil(header.length * 7.2) + 24 + (sortable ? 16 : 0) + 28

/** A status badge: dot, padding and the longest label. */
const badgeWidth = (labels: string[]) => Math.ceil(Math.max(0, ...labels.map((label) => label.length)) * 7.2) + 56

const fixedKinds = new Set<ColumnKind>(['datetime', 'date', 'boolean', 'percent'])

const idLike = /^(number|sku|reference|code)$/

const kindOf = (field: FieldModel, view: ViewModel['fields'][string] | undefined, index: number): ColumnKind => {
  switch (field.type) {
    case 'relation':
      return 'relation'
    case 'file':
      return 'file'
    case 'enum':
      return 'status'
    case 'boolean':
      return 'boolean'
    case 'timestamp':
      return 'datetime'
    case 'date':
      return 'date'
    case 'decimal':
      return view?.format === 'percent' ? 'percent' : view?.prefix === '€' ? 'money' : 'number'
    case 'integer':
    case 'bigint':
      return /quantity|delta/.test(field.name) ? 'signed' : 'number'
    default:
      return idLike.test(field.name) || (index === 0 && field.name === 'id') ? 'id' : 'text'
  }
}

const currencyCents = (value: unknown) => Math.round(Number.parseFloat(String(value)) * 100)

/** Grid columns for a view's list: kinds follow the field types and the view's format hints. */
export const columnsFromModel = (resource: ResourceModel, view: ViewModel | undefined, highlight: string[] = []): ColumnSpec[] => {
  const names = view?.list?.columns ?? Object.keys(resource.fields).slice(0, 6)
  return names.flatMap((name, index) => {
    const field = resource.fields[name]
    if (!field) return []
    const viewField = view?.fields[name]
    const kind = kindOf(field, viewField, index)
    const labels = Object.fromEntries((field.enumValues ?? []).map((value) => [value, enumLabel(value, viewField?.valueLabels)]))
    const spec: ColumnSpec = {
      id: name,
      header: viewField?.label ?? humanize(name),
      kind,
      width: name === 'name' ? 260 : widths[kind],
      sortable: field.sortable,
      minWidth: Math.max(kind === 'id' ? 150 : 0, headerWidth(viewField?.label ?? humanize(name), field.sortable), kind === 'status' ? badgeWidth(Object.values(labels)) : 0),
      ...(fixedKinds.has(kind) && { fixed: true }),
      ...(highlight.includes(name) && { highlight: true }),
      ...(field.type === 'enum' && { tones: Object.fromEntries((field.enumValues ?? []).map((value) => [value, toneFor(value)])), labels }),
      ...(kind === 'money' && { currency: 'EUR', value: (row: { [key: string]: unknown }) => (row[name] == null ? null : currencyCents(row[name])) }),
      ...((kind === 'datetime' || kind === 'date') && { value: (row: { [key: string]: unknown }) => (row[name] == null ? null : Date.parse(String(row[name]))) }),
      ...((kind === 'percent' || (kind === 'number' && field.type === 'decimal')) && { value: (row: { [key: string]: unknown }) => (row[name] == null ? null : Number(row[name])) }),
    }
    return [spec]
  })
}
