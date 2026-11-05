import { userTableNameIssue, type UserTableFieldType } from '@protobase/schema'
import { maxNameBytes } from '@protobase/schema/internal'

export { isUserTableName, maxNameBytes, maxOrganizationNameBytes, organizationColumn, reservedFieldNames, userTableName } from '@protobase/schema/internal'

/** The schema the definitions of the tables users add live in: `tables`, and `fields` of each. */
export const definitionsSchema = 'table_definitions'

/** The schema the tables users add live in, apart from their definitions, so no name of one reaches a definitions table. */
export const userTablesSchema = 'user_tables'

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
} as const satisfies Record<UserTableFieldType, readonly string[]>

export type DefinitionFieldType = keyof typeof definitionColumnTypes

export const definitionFieldTypes = Object.keys(definitionColumnTypes) as DefinitionFieldType[]

/** What is wrong with a name a table or field users add is given, or `undefined` when it may have it; `maxBytes` defaults to 63. */
export const nameProblem = (name: unknown, kind: 'table' | 'field', maxBytes = maxNameBytes) => {
  const issue = userTableNameIssue(name, kind, maxBytes)
  if (issue === 'form') return `Use lowercase letters, digits and "_", starting with a letter, at most ${maxBytes} bytes`
  if (issue === 'reserved_word') return `"${name as string}" is a word SQL reserves`
  if (issue === 'reserved_field') return `"${name as string}" is the name of a field every table has`
  return
}
