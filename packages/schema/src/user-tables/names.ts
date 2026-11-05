import { reservedWords } from './reserved-words'

/** The field types a table users add may have. */
export type UserTableFieldType = 'text' | 'long_text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'timestamp' | 'json'

/** What a name of a user table or field must be: it reaches SQL as an identifier, always quoted too. */
export const userTableName = /^[a-z][a-z0-9_]*$/

/** The most bytes Postgres keeps of an identifier. */
export const maxNameBytes = 63

/**
 * The most bytes the name of a table has in an app with organizations: its table is `t<id>_<name>`, and the id, a
 * bigint, takes up to 19 digits of the 63 bytes Postgres keeps.
 */
export const maxOrganizationNameBytes = maxNameBytes - 21

/** The column that holds the organization of each record of a table users add with organizations, and of each definition. */
export const organizationColumn = 'organization_id'

/** The names a field never takes: the key's, the API's for the record version, and the organization's. */
export const reservedFieldNames: readonly string[] = ['id', 'etag', organizationColumn]

export const isUserTableName = (name: string) => userTableName.test(name) && new TextEncoder().encode(name).length <= maxNameBytes

/** Why a table or field users add may not have a name: its form or length, a word SQL reserves, or a name every table's field has. */
export type UserTableNameIssue = 'form' | 'reserved_word' | 'reserved_field'

/** What is wrong with a name a table or field users add is given, or `undefined` when it may have it; `maxBytes` defaults to 63. */
export const userTableNameIssue = (name: unknown, kind: 'table' | 'field', maxBytes = maxNameBytes): UserTableNameIssue | undefined => {
  if (typeof name !== 'string' || !isUserTableName(name) || new TextEncoder().encode(name).length > maxBytes) return 'form'
  if (reservedWords.has(name)) return 'reserved_word'
  if (kind === 'field' && reservedFieldNames.includes(name)) return 'reserved_field'
  return
}

export { reservedWords }
