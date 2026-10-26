import { sql, type Kysely } from 'kysely'
import { ddl } from './ddl'
import { migrationNames, type StoreMigration } from './migrations/migration'
import { storeMigrations } from './migrations'
import { recordMigrations } from './migrations-table'
import { statementsSql } from './migration-sql'
import type { StoreNames } from './store-names'

// A store an earlier Protobase made by comparing its tables with Better Auth's, without a record of migrations. Each
// migration whose columns the store has, with their types, is recorded as applied; one whose columns it has none of is
// still to apply; one it has only some of means the store matches no version, which is an error.

type Column = { table: string; column: string; type: string }

const key = ({ table, column }: Column) => `${table}.${column}`

const columnsIn = async (db: Kysely<any>, schema: string | undefined) =>
  (
    await sql<Column>`select table_name as "table", column_name as "column", udt_name as "type" from information_schema.columns
      where table_schema = ${schema === undefined ? sql`current_schema()` : schema} order by table_name, ordinal_position`.execute(db)
  ).rows

// Never a schema of the app's: it exists only inside the transaction that is rolled back.
const scratchSchema = 'protobase_auth_adoption'

/** For each migration, the columns it makes: every one runs in a scratch schema, in a transaction that is rolled back. */
const madeColumns = async (db: Kysely<any>, names: StoreNames) => {
  const tx = await db.startTransaction().execute()
  const run = async () => {
    await sql`create schema ${sql.id(scratchSchema)}`.execute(tx)
    const scratch = migrationNames({ ...names, schema: scratchSchema })
    const made: Column[][] = []
    let before: Column[] = []
    for (const migration of storeMigrations) {
      for (const statement of migration.statements(scratch)) await statement.execute(tx)
      const after = await columnsIn(tx, scratchSchema)
      made.push(after.filter((column) => !before.some((earlier) => key(earlier) === key(column))))
      before = after
    }
    return made
  }
  return run().finally(() => tx.rollback().execute())
}

/** Whether the store has any table of the migrations besides the user table, which may be another system's. */
export const storeHasTables = async (db: Kysely<any>, names: StoreNames) => {
  const tables = new Set((await columnsIn(db, names.schema)).map((column) => column.table))
  return storeMigrations.some((migration) => migration.tables.some((table) => tables.has(table)))
}

type Adoption = { adopted: Array<{ migration: StoreMigration; columns: Column[] }>; pending: StoreMigration[] }

/** Which migrations the store matches and which it still needs; a migration it matches only partly is an error. */
export const planAdoption = async (db: Kysely<any>, names: StoreNames): Promise<Adoption> => {
  const made = await madeColumns(db, names)
  const found = new Map((await columnsIn(db, names.schema)).map((column) => [key(column), column.type]))
  const adoption: Adoption = { adopted: [], pending: [] }
  const problems: string[] = []
  storeMigrations.forEach((migration, i) => {
    const columns = made[i]!
    const there = columns.filter((column) => found.has(key(column)))
    if (there.length === 0) return void adoption.pending.push(migration)
    const missing = columns.filter((column) => !found.has(key(column))).map((column) => `lacks ${key(column)}`)
    const otherType = there.filter((column) => found.get(key(column)) !== column.type).map((column) => `has ${key(column)} as ${found.get(key(column))}, not ${column.type}`)
    if (missing.length === 0 && otherType.length === 0) return void adoption.adopted.push({ migration, columns })
    problems.push(`${migration.version} ${migration.name} ${[...missing, ...otherType].join(', ')}`)
  })
  if (problems.length > 0) {
    throw new Error(
      `The auth store an earlier Protobase made matches none of its migrations' versions: ${problems.join('; ')}. Bring it to the schema of Protobase 0.47 first, with that version's \`protobase auth migration\`, then run this again.`,
    )
  }
  return adoption
}

/**
 * The SQL that records the adopted migrations as applied, once it finds every column they make with its type; it
 * stops the migration, naming what it lacks, on a database that differs from the one it was written from.
 */
export const adoptionSql = (names: StoreNames, adopted: Adoption['adopted']) => {
  const expected = adopted.flatMap(({ columns }) => columns).map(({ table, column, type }) => ddl`(${sql.lit(table)}, ${sql.lit(column)}, ${sql.lit(type)})`)
  const schema = names.schema === undefined ? sql`current_schema()` : sql.lit(names.schema)
  const check = ddl`do $adopt$
declare
  missing text;
begin
  select string_agg(expected.table_name || '.' || expected.column_name, ', ' order by expected.table_name, expected.column_name) into missing
  from (values ${sql.join(expected, sql`,\n    `)}) as expected (table_name, column_name, udt_name)
  where not exists (
    select from information_schema.columns found
    where found.table_schema = ${schema} and found.table_name = expected.table_name and found.column_name = expected.column_name and found.udt_name = expected.udt_name
  );
  if missing is not null then
    raise exception 'The auth store does not match the migrations this file adopts: it lacks %, or has them as other types', missing;
  end if;
end
$adopt$`
  const versions = adopted.map(({ migration }) => `${migration.version} ${migration.name}`).join(', ')
  return `-- The auth store an earlier Protobase made, without a record of its migrations, adopted: ${versions}\n-- recorded as applied, once every table and column they make is there.\n${statementsSql([check, recordMigrations(names, adopted.map(({ migration }) => migration))])}`
}
