import { needsColumnCall, type Proposal } from './proposal'

export const quote = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

const literal = (value: string | number | boolean) => (typeof value === 'string' ? quote(value) : String(value))

const base = (p: Proposal) => {
  if (p.type === 'relation') {
    const { resource, columns } = p.relation!
    const call = `f.relation(${quote(resource)})`
    return columns ? `${call}.columns([${columns.map(quote).join(', ')}])` : call
  }
  if (p.type === 'decimal') return `f.decimal({ precision: ${p.precision}, scale: ${p.scale} })`
  if (p.type === 'enum') return `f.enum([${(p.enumValues ?? []).map(quote).join(', ')}])`
  return `f.${p.type}()`
}

// Renders the builder chain for one field, e.g. `f.text().optional().filterable()`.
export const renderField = (p: Proposal) =>
  [
    base(p),
    p.optional && '.optional()',
    p.defaultValue !== undefined && `.default(${literal(p.defaultValue)})`,
    p.dbDefault && '.dbDefault()',
    p.readOnly && '.readOnly()',
    needsColumnCall(p) && `.column(${quote(p.column)})`,
    p.filterable && '.filterable()',
    p.sortable && '.sortable()',
  ]
    .filter(Boolean)
    .join('')
