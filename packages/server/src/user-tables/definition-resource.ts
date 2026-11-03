import { indexServes, type IndexNeed, type TableIndexes } from '@protobase/query'
import { f, resource, view, type AccessContext } from '@protobase/schema'
import { userTablesSchema } from './names'
import type { CheckedDefinition, CheckedField } from './check-definition'

// Every user table starts as the admins' alone: a rule on each operation, so neither a signed-in user without roles
// nor an anonymous visitor reaches it, and `.explicitGrants()` keeps role wildcards such as `*.read` from it.
const admins = ({ user }: AccessContext) => user?.roles?.includes('admin') ?? false

/** The most characters a text field takes: four bytes each at most, it always fits the entry of its btree index. */
export const maxTextLength = 500

const builders = {
  text: () => f.text().max(maxTextLength),
  long_text: () => f.text(),
  integer: () => f.integer(),
  decimal: (field: CheckedField) => f.decimal({ precision: field.precision!, scale: field.scale! }),
  boolean: () => f.boolean(),
  date: () => f.date(),
  timestamp: () => f.timestamp(),
  json: () => f.json(),
}

// An index of the table serves the column for this need, as the scan guard judges it; no column is pinned.
const served = (indexes: TableIndexes, column: string, need: IndexNeed) => indexes.indexes.some((index) => indexServes(index, column, need, new Set()))

const isText = (field: CheckedField) => field.type === 'text' || field.type === 'long_text'

// Filters and sorts are claimed only where an index serves them, as scaffold writes them, so the scan guard never
// refuses one the app offers.
const fieldOf = (field: CheckedField, indexes: TableIndexes) => {
  const built = builders[field.type](field)
  const optional = field.required ? built : built.optional()
  if (field.type === 'json') return optional
  const sortable = served(indexes, field.name, 'btree')
  const filterable = sortable || (isText(field) && served(indexes, field.name, 'trigram'))
  const filtered = filterable ? optional.filterable() : optional
  return sortable ? filtered.sortable() : filtered
}

/**
 * The resource and view of a checked definition over `user_tables.<name>`, with the indexes its table has (none before
 * they are read): built with the schema builders, so it is checked, accessed and guarded as a resource of the config.
 */
export const definitionResource = (definition: CheckedDefinition, indexes: TableIndexes = { kind: 'table', indexes: [] }) => {
  const key = f.bigint().readOnly().dbDefault()
  const keyed = served(indexes, 'id', 'btree') ? key.filterable().sortable() : key
  const fields = Object.fromEntries([['id', keyed], ...definition.fields.map((field) => [field.name, fieldOf(field, indexes)])])
  const title = definition.fields.find((field) => field.name === definition.title_field)
  const base = resource(definition.name)
    .table(`${userTablesSchema}.${definition.name}`)
    .fields(fields)
    .primaryKey((r) => r.id!)
    .explicitGrants()
    .access({ list: admins, read: admins, create: admins, update: admins, delete: admins })
  const searchable = title && served(indexes, title.name, 'trigram') ? base.search((r) => [r[title.name]!]) : base
  const labelled = view<typeof base>(definition.name)
    .names({ singular: definition.singular_label, plural: definition.plural_label })
    .fields((r) => Object.fromEntries(definition.fields.map((field) => {
      const labelledField = r[field.name]!.label(field.label)
      return [field.name, field.type === 'long_text' ? labelledField.multiline() : labelledField]
    })))
  return { resource: searchable, view: title ? labelled.title((r) => r[title.name]!) : labelled }
}
