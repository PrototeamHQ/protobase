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

/** The names a field never takes: the key's, and the API's for the record version. */
export const reservedFieldNames = ['id', 'etag']

/** What is wrong with a name a table or field users add is given, or `undefined` when it may have it. */
export const nameProblem = (name: unknown, kind: 'table' | 'field') => {
  if (typeof name !== 'string' || !isUserTableName(name)) return 'Use lowercase letters, digits and "_", starting with a letter, at most 63 bytes'
  if (reservedWords.has(name)) return `"${name}" is a word SQL reserves`
  if (kind === 'field' && reservedFieldNames.includes(name)) return `"${name}" is the name of a field every table has`
  return undefined
}
