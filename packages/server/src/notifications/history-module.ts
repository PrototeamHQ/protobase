import type { Db } from '@protobase/query'
import type { ModuleInput, ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { historyTableSql } from './history-sql'
import { historyColumns } from './options'
import { cascadesFrom, columnNumbers } from './read-table'
import { regclass } from './schema'
import { qualified } from './schema-sql'
import { tableNames } from './table-names'

/**
 * The history table as the database has it, made by a migration or the app's own: step 1 once it has each column under
 * its configured name and, with sign-in, the foreign key that deletes a user's history with the user. Refuses one
 * without them, naming what it lacks.
 */
const readHistory = async (db: Db, input: ModuleInput): Promise<ModuleModel | undefined> => {
  const { table: names, users } = tableNames(input.names, historyColumns)
  const history = qualified(names)
  const oid = await regclass(db, history)
  if (oid === null) return
  const numbers = await columnNumbers(db, oid, names)
  const missing = historyColumns.find((column) => numbers[column] === undefined)
  if (missing !== undefined) throw new Error(`The history table ${history} has no column "${names.columns[missing]}": add it, or name the table's own with notifications: { history: { columns: { ${missing}: ... } } } in protobase.config.ts`)
  if (users && !(await cascadesFrom(db, oid, numbers.user_id!, users))) {
    throw new Error(`The history table ${history} needs a foreign key from "${names.columns.user_id}" to ${users} with on delete cascade, so a deleted user's history goes with them`)
  }
  return { lastStep: 1, replaceables: {}, names: input.names }
}

/**
 * Each user's notification history, unless a store of the app's own keeps it, under the names the config gives it
 * (`moduleNames`): its user column points at the auth store's users with sign-in. Never dropped.
 */
export const notificationHistoryModule: SchemaModule = {
  label: 'the history table of notifications',
  title: "The table of each user's notification history",
  steps: [
    {
      step: 1,
      name: 'history',
      title: 'The history table and its indexes',
      additive: true,
      sql: (moduleNames) => {
        const { table, user } = tableNames(moduleNames, historyColumns)
        return `${historyTableSql(table, user).join(';\n')};`
      },
    },
  ],
  replaceables: [],
  resourceReplaceables: [],
  read: readHistory,
}
