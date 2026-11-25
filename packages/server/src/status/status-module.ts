import type { Db } from '@protobase/query'
import { cascadesFrom, columnNumbers } from '../notifications/read-table'
import { regclass } from '../notifications/schema'
import { qualified } from '../notifications/schema-sql'
import type { ModuleInput, ModuleModel, SchemaModule } from '../schema-modules/schema-module'
import { statusesTableSql } from './schema-sql'

// The statuses table's columns the server reads.
const columns = ['user_id', 'availability', 'text', 'clears_at', 'updated_at'] as const

/**
 * The statuses table as the database has it: step 1 once it has each column and the foreign key that deletes a user's
 * status with the user. Refuses one without them, naming what it lacks.
 */
const readStatus = async (db: Db, { names }: ModuleInput): Promise<ModuleModel | undefined> => {
  const statuses = qualified({ schema: names.schema!, table: names.table! })
  const oid = await regclass(db, statuses)
  if (oid === null) return
  const numbers = await columnNumbers(db, oid, { schema: names.schema!, table: names.table!, columns: Object.fromEntries(columns.map((column) => [column, column])) })
  const missing = columns.find((column) => numbers[column] === undefined)
  if (missing !== undefined) throw new Error(`The statuses table ${statuses} has no column "${missing}", which no step of this version of Protobase records`)
  if (!(await cascadesFrom(db, oid, numbers.user_id!, names.users!))) {
    throw new Error(`The statuses table ${statuses} needs a foreign key from "user_id" to ${names.users} with on delete cascade, so a deleted user's status goes with them`)
  }
  return { lastStep: 1, replaceables: {}, names }
}

/**
 * The statuses table of people's own status, in the schema `status` names (`names.schema`), its user column pointing
 * at the auth store's users (`names.users`). Never dropped.
 */
export const statusModule: SchemaModule = {
  label: 'the statuses table of status',
  title: "The statuses table of people's own status",
  steps: [
    {
      step: 1,
      name: 'statuses',
      title: 'The statuses table',
      additive: true,
      sql: (names) => `${statusesTableSql({ schema: names.schema!, table: names.table! }, { type: names.user_id_type!, references: `${names.users} (id)` }).join(';\n')};`,
    },
  ],
  replaceables: [],
  resourceReplaceables: [],
  read: readStatus,
}
