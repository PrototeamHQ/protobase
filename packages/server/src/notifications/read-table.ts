import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { TableNames } from './table-names'

// What the notifications modules' `read` finds of a table in the catalogue. Only reads.

const columnsOf = async (db: Db, oid: number) =>
  (await sql<{ name: string; num: number }>`select attname as name, attnum as num from pg_attribute where attrelid = ${oid} and attnum > 0 and not attisdropped`.execute(db)).rows

/** Each column of `names` by its number in the table, `undefined` for one the table lacks. */
export const columnNumbers = async <C extends string>(db: Db, oid: number, names: TableNames<C>) => {
  const found = await columnsOf(db, oid)
  return Object.fromEntries(Object.entries<string>(names.columns).map(([column, name]) => [column, found.find((row) => row.name === name)?.num])) as Record<C, number | undefined>
}

/** Whether a unique index without a condition holds exactly the column. */
export const uniqueOn = async (db: Db, oid: number, num: number) =>
  (await sql<{ found: boolean }>`select exists (select from pg_index where indrelid = ${oid} and indisunique and indpred is null and indexprs is null and indnatts = 1 and indkey[0] = ${num}) as found`.execute(db)).rows[0]!.found

/** Whether a foreign key from exactly the column points at the users table and deletes with it. */
export const cascadesFrom = async (db: Db, oid: number, num: number, users: string) =>
  (await sql<{ found: boolean }>`select exists (select from pg_constraint where conrelid = ${oid} and contype = 'f' and confdeltype = 'c'
    and conkey = array[${num}]::int2[] and confrelid = to_regclass(${users})) as found`.execute(db)).rows[0]!.found
