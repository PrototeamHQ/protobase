import { definitionColumnTypes, definitionFieldTypes, isUserTableName, userTablesSchema, type DefinitionFieldType } from './names'
import type { StoredDefinition, StoredField, UserTableColumns } from './read-definitions'

/** A field of a definition that passed `checkDefinition`: its name is a safe identifier and its type one of the eight. */
export type CheckedField = Omit<StoredField, 'type'> & { type: DefinitionFieldType }

/** A definition that passed `checkDefinition`, which a resource is built from. */
export type CheckedDefinition = Omit<StoredDefinition, 'fields'> & { fields: CheckedField[] }

// Names the key takes, and the API takes for the record version.
const reservedFields = ['id', 'etag']

const isFieldType = (type: string): type is DefinitionFieldType => (definitionFieldTypes as string[]).includes(type)

// The first thing wrong with a field, against its column.
const fieldProblem = (field: StoredField, columns: ReadonlyMap<string, { type: string; notNull: boolean }>) => {
  if (!isUserTableName(field.name)) return `the field name ${JSON.stringify(field.name)} is not lowercase letters, digits and "_", starting with a letter, at most 63 bytes`
  if (reservedFields.includes(field.name)) return `the field name "${field.name}" is reserved`
  if (!isFieldType(field.type)) return `the field "${field.name}" has the type ${JSON.stringify(field.type)}, which is not one of ${definitionFieldTypes.join(', ')}`
  if (field.type === 'decimal' && (field.precision === null || field.scale === null)) return `the decimal field "${field.name}" has no precision and scale`
  const column = columns.get(field.name)
  if (!column) return `the column "${field.name}" does not exist`
  if (!(definitionColumnTypes[field.type] as readonly string[]).includes(column.type)) return `the column "${field.name}" is ${column.type}, not what a ${field.type} field needs (${definitionColumnTypes[field.type].join(' or ')})`
  if (!field.required && column.notNull) return `the optional field "${field.name}" has a NOT NULL column`
  return undefined
}

/**
 * The definition checked against the user tables schema, or the first thing wrong with it: every name a safe
 * identifier, every type one of the eight, its table there with an `id bigint` primary key and a column of the right
 * type for each field, and its title a text field of it.
 */
export const checkDefinition = (definition: StoredDefinition, tables: UserTableColumns): { definition: CheckedDefinition } | { problem: string } => {
  const problem = (text: string) => ({ problem: `The user table ${JSON.stringify(definition.name)} is not served: ${text}.` })
  if (!isUserTableName(definition.name)) return problem('its name is not lowercase letters, digits and "_", starting with a letter, at most 63 bytes')
  const columns = tables.get(definition.name)
  if (!columns) return problem(`the table ${userTablesSchema}.${definition.name} does not exist`)
  const id = columns.get('id')
  if (!id || id.type !== 'bigint' || !id.key) return problem(`${userTablesSchema}.${definition.name} has no "id" bigint primary key`)
  const seen = new Set<string>()
  for (const field of definition.fields) {
    if (seen.has(field.name)) return problem(`the field "${field.name}" is defined twice`)
    seen.add(field.name)
    const found = fieldProblem(field, columns)
    if (found) return problem(found)
  }
  const title = definition.fields.find((field) => field.name === definition.title_field)
  if (definition.title_field !== null && (!title || (title.type !== 'text' && title.type !== 'long_text'))) return problem(`its title "${definition.title_field}" is not one of its text fields`)
  return { definition: { ...definition, fields: definition.fields as CheckedField[] } }
}
