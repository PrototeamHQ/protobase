import type { Db } from '../db/connection'

const schemas = ['core', 'crm', 'catalog', 'sales', 'inventory', 'hr']

export const truncateAll = async (sql: Db) => {
  const tables = await sql`
    select format('%I.%I', schemaname, tablename) as name from pg_tables
    where schemaname in ${sql(schemas)} or tablename = 'seed_info'
  `
  await sql.unsafe(`truncate ${tables.map((table) => table.name).join(', ')} restart identity cascade`)
}

// Secondary indexes only: primary keys and unique constraints stay in place.
const secondaryIndexes = (sql: Db) => sql`
  select format('%I.%I', n.nspname, c.relname) as name, pg_get_indexdef(i.indexrelid) as definition
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ${sql(schemas)}
    and not i.indisprimary
    and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
`

// Loading into indexed tables is several times slower than building the indexes afterwards.
export const dropIndexes = async (sql: Db) => {
  const indexes = await secondaryIndexes(sql)
  for (const index of indexes) await sql.unsafe(`drop index ${index.name}`)
  return indexes.map((index) => index.definition as string)
}

export const createIndexes = async (sql: Db, definitions: string[]) => {
  await Promise.all(definitions.map((definition) => sql.unsafe(definition)))
}

// COPY with explicit ids leaves identity sequences at 1.
export const resetSequences = async (sql: Db) => {
  const columns = await sql`
    select table_schema as schema, table_name as table, column_name as column from information_schema.columns
    where is_identity = 'YES' and table_schema in ${sql(schemas)}
  `
  for (const { schema, table, column } of columns) {
    const target = `${schema}.${table}`
    await sql.unsafe(`select setval(pg_get_serial_sequence('${target}', '${column}'), coalesce(max(${column}), 1), max(${column}) is not null) from ${target}`)
  }
}

export const analyzeAll = async (sql: Db) => {
  await sql.unsafe('analyze')
}
