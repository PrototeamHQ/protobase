import { reservedWords } from './reserved-words'

/** The schema the definitions of the tables users add live in: `tables`, and `fields` of each. */
export const definitionsSchema = 'table_definitions'

/** The schema the tables users add live in, apart from their definitions, so no name of one reaches a definitions table. */
export const userTablesSchema = 'user_tables'

/** What a name of a user table or field must be: it reaches SQL as an identifier, always quoted too. */
export const userTableName = /^[a-z][a-z0-9_]*$/

/** The most bytes Postgres keeps of an identifier. */
export const maxNameBytes = 63

/** The field types a definition may give, each with the Postgres types its column may have. */
export const definitionColumnTypes = {
  text: ['text'],
  long_text: ['text'],
  integer: ['integer'],
  decimal: ['numeric'],
  boolean: ['boolean'],
  date: ['date'],
  timestamp: ['timestamp with time zone'],
  json: ['jsonb'],
} as const

export type DefinitionFieldType = keyof typeof definitionColumnTypes

export const definitionFieldTypes = Object.keys(definitionColumnTypes) as DefinitionFieldType[]

export const isUserTableName = (name: string) => userTableName.test(name) && new TextEncoder().encode(name).length <= maxNameBytes

/** The column that holds the organization of each record of a table users add with organizations, and of each definition. */
export const organizationColumn = 'organization_id'

/** The names a field never takes: the key's, the API's for the record version, and the organization's. */
export const reservedFieldNames = ['id', 'etag', organizationColumn]

/**
 * The most bytes the name of a table has in an app with organizations: its table is `t<id>_<name>`, and the id, a
 * bigint, takes up to 19 digits of the 63 bytes Postgres keeps.
 */
export const maxOrganizationNameBytes = maxNameBytes - 21

/** What is wrong with a name a table or field users add is given, or `undefined` when it may have it; `maxBytes` defaults to 63. */
export const nameProblem = (name: unknown, kind: 'table' | 'field', maxBytes = maxNameBytes) => {
  if (typeof name !== 'string' || !isUserTableName(name) || new TextEncoder().encode(name).length > maxBytes) return `Use lowercase letters, digits and "_", starting with a letter, at most ${maxBytes} bytes`
  if (reservedWords.has(name)) return `"${name}" is a word SQL reserves`
  if (kind === 'field' && reservedFieldNames.includes(name)) return `"${name}" is the name of a field every table has`
  return undefined
}
