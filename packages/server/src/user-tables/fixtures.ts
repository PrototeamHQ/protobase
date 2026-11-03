import type { StoredColumn, StoredDefinition, StoredField, UserTableColumns } from './read-definitions'

/** A stored definition of `notes` with a title and a body, for the tests of user tables. */
export const notesDefinition = (patch: Partial<StoredDefinition> = {}): StoredDefinition => ({
  id: '1',
  name: 'notes',
  organization_id: null,
  singular_label: 'Note',
  plural_label: 'Notes',
  title_field: 'title',
  version: '1',
  fields: [field({ name: 'title', label: 'Title', required: true }), field({ name: 'body', label: 'Body', type: 'long_text' })],
  ...patch,
})

/** A stored field, optional text unless the patch says otherwise. */
export const field = (patch: Partial<StoredField>): StoredField => ({ name: 'title', label: 'Title', type: 'text', required: false, precision: null, scale: null, ...patch })

const column = (type: string, notNull = false, key = false): StoredColumn => ({ type, notNull, key })

/** The catalogue's columns of `user_tables.notes`, with an `id` key, a NOT NULL title and a body, and the tables given. */
export const notesColumns = (more: Record<string, Record<string, StoredColumn>> = {}): UserTableColumns =>
  new Map(Object.entries({ notes: { id: column('bigint', true, true), title: column('text', true), body: column('text') }, ...more }).map(([table, columns]) => [table, new Map(Object.entries(columns))]))

export { column }
