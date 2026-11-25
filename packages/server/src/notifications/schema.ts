import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { AdminAuth } from '../better-auth/create-auth'
import { qualified } from './schema-sql'

/** Auth's users table, as the store names it: devices point at it. */
export const authUsersTable = (auth: AdminAuth) => ({ schema: auth.names.schema, table: auth.names.table('user').name })

export type UsersTable = ReturnType<typeof authUsersTable>

export const regclass = async (db: Db, name: string) => (await sql<{ oid: number | null }>`select to_regclass(${name})::oid as oid`.execute(db)).rows[0]!.oid

// The type of the users table's id, which the user column of a feature's rows takes, such as notifications' devices.
export const userIdType = async (db: Db, users: UsersTable, of = { feature: 'notifications', rows: 'devices' }) => {
  const oid = await regclass(db, qualified(users))
  if (oid === null) throw new Error(`${of.feature}: auth's users table ${qualified(users)} is not in the app's database, so ${of.rows} cannot point at it`)
  const { rows } = await sql<{ type: string }>`select format_type(atttypid, atttypmod) as type from pg_attribute where attrelid = ${oid} and attname = 'id'`.execute(db)
  return rows[0]!.type
}
