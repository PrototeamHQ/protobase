import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { storeSchema } from '../better-auth/auth-tables'
import type { AdminAuth } from '../better-auth/create-auth'
import { migrationCommand } from '../changes/capture-schema'
import { notificationsNames, type NotificationsNames, type NotificationsOptions } from './options'
import { devicesTableSql, qualified } from './schema-sql'

/** Auth's users table, as the store names it: devices point at it. */
export const authUsersTable = (auth: AdminAuth) => ({ schema: storeSchema(auth), table: auth.options.user?.modelName ?? 'user' })

type UsersTable = ReturnType<typeof authUsersTable>

const regclass = async (db: Db, name: string) => (await sql<{ oid: number | null }>`select to_regclass(${name})::oid as oid`.execute(db)).rows[0]!.oid

// The type of the users table's id, which the devices' user column takes.
const userIdType = async (db: Db, users: UsersTable) => {
  const oid = await regclass(db, qualified(users))
  if (oid === null) throw new Error(`notifications(): auth's users table ${qualified(users)} is not in the app's database, so devices cannot point at it`)
  const { rows } = await sql<{ type: string }>`select format_type(atttypid, atttypmod) as type from pg_attribute where attrelid = ${oid} and attname = 'id'`.execute(db)
  return rows[0]!.type
}

/**
 * The SQL that adds the devices table `notifications()` keeps devices in, under the names its options give; with
 * `auth`, its user column points at auth's users table. `undefined` when the table exists, and with a store of the
 * app's own, which needs none.
 */
export const notificationsMigration = async (db: Db, options: NotificationsOptions = {}, auth?: AdminAuth) => {
  if (options.store) return undefined
  const names = notificationsNames(options)
  if ((await regclass(db, qualified(names))) !== null) return undefined
  const users = auth && authUsersTable(auth)
  const user = users ? { type: await userIdType(db, users), references: `${qualified(users)} (id)` } : { type: 'text' }
  return `${devicesTableSql(names, user).join(';\n\n')};`
}

const columnsOf = async (db: Db, oid: number) =>
  (await sql<{ name: string; num: number }>`select attname as name, attnum as num from pg_attribute where attrelid = ${oid} and attnum > 0 and not attisdropped`.execute(db)).rows

// Whether a unique index without a condition holds exactly the column.
const uniqueOn = async (db: Db, oid: number, num: number) =>
  (await sql<{ found: boolean }>`select exists (select from pg_index where indrelid = ${oid} and indisunique and indpred is null and indexprs is null and indnatts = 1 and indkey[0] = ${num}) as found`.execute(db)).rows[0]!.found

// Whether a foreign key from exactly the column points at the users table and deletes with it.
const cascadesFrom = async (db: Db, oid: number, num: number, users: UsersTable) =>
  (await sql<{ found: boolean }>`select exists (select from pg_constraint where conrelid = ${oid} and contype = 'f' and confdeltype = 'c'
    and conkey = array[${num}]::int2[] and confrelid = to_regclass(${qualified(users)})) as found`.execute(db)).rows[0]!.found

/**
 * Refuses to start while the devices table lacks what `notifications()` needs, naming it: the table, each column under
 * its configured name, a unique index on the token alone, which moving a device relies on, and with `auth` a foreign key
 * from the user column that deletes a user's devices with the user. Nothing to check with a store of the app's own.
 */
export const checkNotificationsSchema = async (db: Db, options: NotificationsOptions = {}, auth?: AdminAuth) => {
  if (options.store) return
  const names: NotificationsNames = notificationsNames(options)
  const devices = qualified(names)
  const oid = await regclass(db, devices)
  if (oid === null) throw new Error(`The devices table ${devices} of notifications() is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
  const found = await columnsOf(db, oid)
  const numOf = (column: keyof NotificationsNames['columns']) => found.find((row) => row.name === names.columns[column])?.num
  const missing = (Object.keys(names.columns) as (keyof NotificationsNames['columns'])[]).find((column) => numOf(column) === undefined)
  if (missing !== undefined) throw new Error(`The devices table ${devices} has no column "${names.columns[missing]}": add it, or name the table's own with notifications({ devices: { columns: { ${missing}: ... } } })`)
  if (!(await uniqueOn(db, oid, numOf('token')!))) throw new Error(`The devices table ${devices} needs a unique index on its token column "${names.columns.token}" alone, which moving a device to the user who registers it relies on`)
  const users = auth && authUsersTable(auth)
  if (users && !(await cascadesFrom(db, oid, numOf('user_id')!, users))) {
    throw new Error(`The devices table ${devices} needs a foreign key from "${names.columns.user_id}" to ${qualified(users)} with on delete cascade, so a deleted user's devices go with them`)
  }
}
