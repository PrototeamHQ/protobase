import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { storeSchema } from '../better-auth/auth-tables'
import type { AdminAuth } from '../better-auth/create-auth'
import { migrationCommand } from '../changes/capture-schema'
import { historyTableSql } from './history-sql'
import { historyNames, notificationsNames, type NotificationsNames, type NotificationsOptions } from './options'
import { deviceSessionColumnSql, devicesTableSql, qualified } from './schema-sql'

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

const columnsOf = async (db: Db, oid: number) =>
  (await sql<{ name: string; num: number }>`select attname as name, attnum as num from pg_attribute where attrelid = ${oid} and attnum > 0 and not attisdropped`.execute(db)).rows

// Whether a unique index without a condition holds exactly the column.
const uniqueOn = async (db: Db, oid: number, num: number) =>
  (await sql<{ found: boolean }>`select exists (select from pg_index where indrelid = ${oid} and indisunique and indpred is null and indexprs is null and indnatts = 1 and indkey[0] = ${num}) as found`.execute(db)).rows[0]!.found

// Whether a foreign key from exactly the column points at the users table and deletes with it.
const cascadesFrom = async (db: Db, oid: number, num: number, users: UsersTable) =>
  (await sql<{ found: boolean }>`select exists (select from pg_constraint where conrelid = ${oid} and contype = 'f' and confdeltype = 'c'
    and conkey = array[${num}]::int2[] and confrelid = to_regclass(${qualified(users)})) as found`.execute(db)).rows[0]!.found

// Whether the devices table exists without its session column, as one written before devices kept their session.
const lacksSessionColumn = async (db: Db, names: NotificationsNames) => {
  const oid = await regclass(db, qualified(names))
  return oid !== null && !(await columnsOf(db, oid)).some((row) => row.name === names.columns.session_id)
}

/**
 * The SQL that adds the tables `notifications()` keeps devices and each user's history in, under the names its options
 * give; with `auth`, their user columns point at auth's users table. Each table is left out when it exists or a store
 * of the app's own replaces it, and an existing devices table without its session column gets that column;
 * `undefined` when nothing is left.
 */
export const notificationsMigration = async (db: Db, options: NotificationsOptions = {}, auth?: AdminAuth) => {
  const devices = !options.store && notificationsNames(options)
  const history = !options.historyStore && historyNames(options)
  const missing = async (names: { schema: string; table: string } | false) => names && (await regclass(db, qualified(names))) === null
  const [needsDevices, needsHistory] = [await missing(devices), await missing(history)]
  const needsSession = devices && !needsDevices && (await lacksSessionColumn(db, devices))
  if (!needsDevices && !needsHistory && !needsSession) return undefined
  const users = auth && authUsersTable(auth)
  const user = users && (needsDevices || needsHistory) ? { type: await userIdType(db, users), references: `${qualified(users)} (id)` } : { type: 'text' }
  const statements = [
    ...(needsDevices && devices ? devicesTableSql(devices, user) : []),
    ...(needsSession && devices ? [deviceSessionColumnSql(devices)] : []),
    ...(needsHistory && history ? historyTableSql(history, user) : []),
  ]
  return `${[...new Set(statements)].join(';\n\n')};`
}

const missingTable = (what: string, table: string) =>
  new Error(`The ${what} table ${table} of notifications() is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)

/**
 * Refuses to start while the devices table lacks what `notifications()` needs, naming it: the table, each column under
 * its configured name, a unique index on the token alone, which moving a device relies on, and with `auth` a foreign key
 * from the user column that deletes a user's devices with the user. Nothing to check with a store of the app's own.
 */
const checkDevicesTable = async (db: Db, options: NotificationsOptions, users: UsersTable | undefined) => {
  if (options.store) return
  const names: NotificationsNames = notificationsNames(options)
  const devices = qualified(names)
  const oid = await regclass(db, devices)
  if (oid === null) throw missingTable('devices', devices)
  const found = await columnsOf(db, oid)
  const numOf = (column: keyof NotificationsNames['columns']) => found.find((row) => row.name === names.columns[column])?.num
  const missing = (Object.keys(names.columns) as (keyof NotificationsNames['columns'])[]).find((column) => numOf(column) === undefined)
  if (missing !== undefined) throw new Error(`The devices table ${devices} has no column "${names.columns[missing]}": add it, or name the table's own with notifications({ devices: { columns: { ${missing}: ... } } })`)
  if (!(await uniqueOn(db, oid, numOf('token')!))) throw new Error(`The devices table ${devices} needs a unique index on its token column "${names.columns.token}" alone, which moving a device to the user who registers it relies on`)
  if (users && !(await cascadesFrom(db, oid, numOf('user_id')!, users))) {
    throw new Error(`The devices table ${devices} needs a foreign key from "${names.columns.user_id}" to ${qualified(users)} with on delete cascade, so a deleted user's devices go with them`)
  }
}

/** Refuses to start while the history table lacks its table, a column or, with `auth`, the cascading foreign key. */
const checkHistoryTable = async (db: Db, options: NotificationsOptions, users: UsersTable | undefined) => {
  if (options.historyStore) return
  const names = historyNames(options)
  const history = qualified(names)
  const oid = await regclass(db, history)
  if (oid === null) throw missingTable('history', history)
  const found = await columnsOf(db, oid)
  const numOf = (column: keyof typeof names.columns) => found.find((row) => row.name === names.columns[column])?.num
  const missing = (Object.keys(names.columns) as (keyof typeof names.columns)[]).find((column) => numOf(column) === undefined)
  if (missing !== undefined) throw new Error(`The history table ${history} has no column "${names.columns[missing]}": add it, or name the table's own with notifications({ history: { columns: { ${missing}: ... } } })`)
  if (users && !(await cascadesFrom(db, oid, numOf('user_id')!, users))) {
    throw new Error(`The history table ${history} needs a foreign key from "${names.columns.user_id}" to ${qualified(users)} with on delete cascade, so a deleted user's history goes with them`)
  }
}

/** Refuses to start while the devices or the history table lacks what `notifications()` needs, naming it. */
export const checkNotificationsSchema = async (db: Db, options: NotificationsOptions = {}, auth?: AdminAuth) => {
  const users = auth && authUsersTable(auth)
  await checkDevicesTable(db, options, users)
  await checkHistoryTable(db, options, users)
}
