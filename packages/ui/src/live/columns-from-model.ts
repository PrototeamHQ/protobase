import { enumLabel, type FieldModel, type ResourceModel, type ViewModel } from '@protobase/schema'
import { listColumnNames } from '@protobase/schema/internal'
import type { BadgeTone } from '../primitives/badge'
import type { ColumnKind, ColumnSpec } from '../data-grid'
import { badgeWidth, headerWidth } from '../data-grid/content-widths'
import { humanize } from './naming'
import { markdownExcerpt } from '../markdown/markdown-excerpt'
import { isMarkdown } from '../markdown/markdown-hint'
import { recordTitleField } from './model-helpers'
import { contactFormat } from './contact-links'

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

export { listColumnNames }

/** Grid columns for `names`, by default the view's list: kinds follow the field types and the view's format hints. */
export const columnsFromModel = (resource: ResourceModel, view: ViewModel | undefined, highlight: string[] = [], names = listColumnNames(resource, view)): ColumnSpec[] => {
  const title = recordTitleField(resource, view)
  return names.flatMap((name, index) => {
    const field = resource.fields[name]
    if (!field) return []
    const viewField = view?.fields[name]
    const kind = kindOf(field, viewField, index)
    const labels = Object.fromEntries((field.enumValues ?? []).map((value) => [value, enumLabel(value, viewField?.valueLabels)]))
    // Room for the suffix after the value, such as ` /month`, which a narrower column would cut off.
    const suffixWidth = viewField?.suffix ? Math.ceil(viewField.suffix.length * 7.2) : 0
    const spec: ColumnSpec = {
      id: name,
      header: viewField?.label ?? humanize(name),
      kind,
      width: (name === 'name' ? 260 : widths[kind]) + suffixWidth,
      sortable: field.sortable,
      minWidth: Math.max(kind === 'id' ? 150 : 0, headerWidth(viewField?.label ?? humanize(name), field.sortable), kind === 'status' ? badgeWidth(Object.values(labels)) : 0, suffixWidth > 0 ? widths[kind] + suffixWidth : 0),
      ...(fixedKinds.has(kind) && { fixed: true }),
      ...(name === title && { title: true }),
      // The title cell links to the record, so an address there stays text
      ...(kind === 'text' && name !== title && contactFormat(viewField) && { link: contactFormat(viewField) }),
      ...(highlight.includes(name) && { highlight: true }),
      ...(field.type === 'enum' && { tones: Object.fromEntries((field.enumValues ?? []).map((value) => [value, toneFor(value)])), labels }),
      ...(field.type === 'enum' && viewField?.valueColors && { colors: viewField.valueColors }),
      ...(field.type === 'enum' && viewField?.badgeShape && { shape: viewField.badgeShape }),
      ...(viewField?.suffix !== undefined && { suffix: viewField.suffix }),
      ...(kind === 'datetime' && viewField?.format === 'relative' && { relative: true }),
      ...(kind === 'money' && viewField?.decimals !== undefined && { decimals: viewField.decimals }),
      ...(kind === 'money' && { currency: 'EUR', value: (row: { [key: string]: unknown }) => (row[name] == null ? null : currencyCents(row[name])) }),
      ...((kind === 'datetime' || kind === 'date') && { value: (row: { [key: string]: unknown }) => (row[name] == null ? null : Date.parse(String(row[name]))) }),
      ...(isMarkdown(field, viewField) && { value: (row: { [key: string]: unknown }) => (typeof row[name] === 'string' ? markdownExcerpt(row[name]) : row[name]) }),
      ...((kind === 'percent' || (kind === 'number' && field.type === 'decimal')) && { value: (row: { [key: string]: unknown }) => (row[name] == null ? null : Number(row[name])) }),
    }
    return [spec]
  })
}
