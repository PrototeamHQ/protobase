import { sql } from 'kysely'
import { indexServes, tableIndexes, type Db } from '@protobase/query'
import { badRequest } from '../problem'
import type { PipelineHook, Row } from '../types'
import { checkDefinition } from './check-definition'
import { definitionResource } from './definition-resource'
import { fieldsResourceName, tablesResourceName } from './definitions-resources'
import { definitionsSchema, userTablesSchema } from './names'
import { readDefinitions, readUserTableColumns } from './read-definitions'
import { createOrganizationTableSql, createTableSql, fieldSql, trigramIndexSql, type FieldRow } from './table-ddl'

const refuse = (field: string, message: string) => badRequest('invalid-record', `The request body is invalid: ${field}: ${message}`, { errors: [{ field, code: 'invalid-value', message }] })

const tablesTable = sql.table(`${definitionsSchema}.tables`)

const raiseVersion = (trx: Db, tableId: unknown) => sql`update ${tablesTable} set version = version + 1 where id = ${tableId}`.execute(trx)

// Locked until the write commits, so two fields added to one table at once are added one after the other. Only a table
// of the field's own organization, or of none for a field of none, is found, as the foreign key holds too.
const lockedTable = async (trx: Db, tableId: unknown, organizationId: unknown) => {
  const { rows } = await sql<{ name: string }>`select table_name as name from ${tablesTable} where id = ${tableId} and tenant_key = coalesce(${organizationId ?? null}::text, '-') for update`.execute(trx)
  if (!rows[0]) throw refuse('table_id', 'There is no such table')
  return rows[0]
}

// The table's definition as the rebuild will read it, checked and built into its resource, so no definition is stored
// that a process could not serve; with the table's indexes, as the resource builder reads them.
const builtDefinition = async (trx: Db, tableId: unknown) => {
  const [definitions, columns] = await Promise.all([readDefinitions(trx), readUserTableColumns(trx)])
  const stored = definitions.find((definition) => definition.id === String(tableId))!
  const checked = checkDefinition(stored, columns)
  if ('problem' in checked) throw new Error(`A definition the API wrote does not check: ${checked.problem}`)
  const indexes = await tableIndexes(trx, definitionResource(checked.definition).resource.toModel())
  definitionResource(checked.definition, indexes)
  return { definition: checked.definition, indexes }
}

// The table is named as the database computed it (`table_name`): an organization's carries its organization column.
const createTable = async (trx: Db, table: Row) => {
  if (table.title_field != null) throw refuse('title_field', 'Set the title field once its field is added')
  const { rows } = await sql<{ found: boolean }>`select to_regclass(format('%I.%I', ${userTablesSchema}::text, ${table.table_name}::text)) is not null as found`.execute(trx)
  if (rows[0]!.found) throw refuse('name', `The database already has a table "${table.table_name}" for the tables users add`)
  const statements = table.organization_id == null ? [createTableSql(table.table_name)] : createOrganizationTableSql(table.table_name)
  for (const statement of statements) await statement.execute(trx)
  await builtDefinition(trx, table.id)
}

const addField = async (trx: Db, field: Row, taken: readonly string[]) => {
  const table = await lockedTable(trx, field.table_id, field.organization_id)
  if (taken.includes(table.name)) throw refuse('table_id', `"${table.name}" is a resource in the app's code now, which owns its fields`)
  const { rows } = await sql<{ found: boolean }>`select exists (select from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${userTablesSchema} and c.relname = ${table.name} and a.attname = ${field.name} and a.attnum > 0 and not a.attisdropped) as found`.execute(trx)
  if (rows[0]!.found) throw refuse('name', `The table already has a column "${field.name}"`)
  for (const statement of fieldSql(table.name, field as FieldRow)) await statement.execute(trx)
  await raiseVersion(trx, field.table_id)
  await builtDefinition(trx, field.table_id)
}

// The title is a text field of the table, searched through a pg_trgm index, added when none serves it yet.
const setTitle = async (trx: Db, table: Row) => {
  const title = table.title_field as string
  const { rows } = await sql<{ type: string }>`select type from ${sql.table(`${definitionsSchema}.fields`)} where table_id = ${table.id} and name = ${title}`.execute(trx)
  if (rows[0]?.type !== 'text' && rows[0]?.type !== 'long_text') throw refuse('title_field', `"${title}" is not a text field of this table`)
  const { definition, indexes } = await builtDefinition(trx, table.id)
  if (indexes.indexes.some((index) => indexServes(index, title, 'trigram', new Set()))) return
  await trigramIndexSql(definition.name, title).execute(trx)
}

/**
 * Creates in the database what a write of a definition describes, inside its transaction, from the rows as written: a
 * new table, a new field's column and index, the title's search index. Changing a field raises its table's version, so
 * every process serves the change; any update of a table, a label or its title, raises it already, as the version column
 * of the record's ETag (`etagBump` in `records.ts`). A definition is never deleted.
 * `taken` holds the names of the app's resources and those Protobase adds.
 */
export const definitionsHook = (taken: readonly string[]): PipelineHook => async (event, trx) => {
  const { name } = event.resource
  if (name !== tablesResourceName && name !== fieldsResourceName) return
  if (event.operation === 'delete' || event.operation === 'undelete') throw new Error(`A ${name} record is never deleted`)
  const after = event.after!
  if (name === tablesResourceName) {
    if (event.operation === 'create') return createTable(trx, after)
    if (after.title_field != null && after.title_field !== event.before?.title_field) return setTitle(trx, after)
    return
  }
  if (event.operation === 'create') return addField(trx, after, taken)
  await raiseVersion(trx, after.table_id)
}
