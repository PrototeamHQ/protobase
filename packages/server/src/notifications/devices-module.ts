import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ModuleInput, ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { legacyKindChecks, type KindCheck } from './legacy-kind-checks'
import { deviceColumns, type DeviceColumn } from './options'
import { cascadesFrom, columnNumbers, uniqueOn } from './read-table'
import { regclass } from './schema'
import { devicesTableSql, qualified } from './schema-sql'
import { tableNames, type TableNames } from './table-names'

const upgradeFirst = 'with `protobase migration` and `protobase migrate` of Protobase 0.14.2 first, then run this command again'

// The framework's kind checks of a table written before devices could be relay devices (`legacyKindChecks`).
const kindChecksWithoutRelay = async (db: Db, oid: number, names: TableNames<DeviceColumn>) => {
  const { rows } = await sql<KindCheck>`select c.conname as name, pg_get_constraintdef(c.oid) as def from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = ${oid} and c.contype = 'c' and a.attname = ${names.columns.kind} order by c.conname`.execute(db)
  return legacyKindChecks(rows, names.columns)
}

/**
 * The devices table as the database has it, made by a migration or the app's own: step 1 once it has each column under
 * its configured name, a unique index on the token alone, which moving a device relies on, and with sign-in a foreign
 * key from the user column that deletes a user's devices with the user. Refuses one written before devices kept their
 * session or could be relay devices, which no step records, and one without what the server relies on, naming it.
 */
const readDevices = async (db: Db, input: ModuleInput): Promise<ModuleModel | undefined> => {
  const { table: names, users } = tableNames(input.names, deviceColumns)
  const devices = qualified(names)
  const oid = await regclass(db, devices)
  if (oid === null) return
  const numbers = await columnNumbers(db, oid, names)
  if (numbers.session_id === undefined || (await kindChecksWithoutRelay(db, oid, names)).length > 0) {
    throw new Error(`The devices table ${devices} was written before devices kept their session and could be relay devices, which no step of this version of Protobase records: bring it there ${upgradeFirst}`)
  }
  const missing = deviceColumns.find((column) => numbers[column] === undefined)
  if (missing !== undefined) throw new Error(`The devices table ${devices} has no column "${names.columns[missing]}": add it, or name the table's own with notifications: { devices: { columns: { ${missing}: ... } } } in protobase.config.ts`)
  if (!(await uniqueOn(db, oid, numbers.token!))) throw new Error(`The devices table ${devices} needs a unique index on its token column "${names.columns.token}" alone, which moving a device to the user who registers it relies on`)
  if (users && !(await cascadesFrom(db, oid, numbers.user_id!, users))) {
    throw new Error(`The devices table ${devices} needs a foreign key from "${names.columns.user_id}" to ${users} with on delete cascade, so a deleted user's devices go with them`)
  }
  return { lastStep: 1, replaceables: {}, names: input.names }
}

/**
 * The devices table notifications push to, unless a store of the app's own keeps them, under the names the config gives
 * it (`moduleNames`): its user column points at the auth store's users with sign-in. Never dropped.
 */
export const notificationDevicesModule: SchemaModule = {
  label: 'the devices table of notifications',
  title: 'The devices table of notifications',
  steps: [
    {
      step: 1,
      name: 'devices',
      title: 'The devices table and its indexes',
      additive: true,
      sql: (moduleNames) => {
        const { table, user } = tableNames(moduleNames, deviceColumns)
        return `${devicesTableSql(table, user).join(';\n')};`
      },
    },
  ],
  replaceables: [],
  resourceReplaceables: [],
  read: readDevices,
}
