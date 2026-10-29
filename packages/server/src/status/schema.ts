import type { Db } from '@protobase/query'
import type { AdminAuth } from '../better-auth/create-auth'
import { migrationCommand } from '../changes/capture-schema'
import { authUsersTable, regclass, userIdType } from '../notifications/schema'
import { qualified } from '../notifications/schema-sql'
import { checkStatusAuth, statusNames, type StatusOptions } from './options'
import { statusesTableSql } from './schema-sql'

/**
 * The SQL that adds the statuses table `status` keeps people's statuses in, its user column pointing at auth's users
 * table; `undefined` when it exists. An app without organizations is refused (see `checkStatusAuth`).
 */
export const statusMigration = async (db: Db, options: StatusOptions, auth: AdminAuth | undefined) => {
  checkStatusAuth(auth)
  const names = statusNames(options)
  if ((await regclass(db, qualified(names))) !== null) return
  const users = authUsersTable(auth!)
  const type = await userIdType(db, users, { feature: 'status', rows: 'statuses' })
  return `${statusesTableSql(names, { type, references: `${qualified(users)} (id)` }).join(';\n\n')};`
}

/** Refuses to start while the statuses table is missing, or the app has no organizations. */
export const checkStatusSchema = async (db: Db, options: StatusOptions, auth: AdminAuth | undefined) => {
  checkStatusAuth(auth)
  const table = qualified(statusNames(options))
  if ((await regclass(db, table)) !== null) return
  throw new Error(`The statuses table ${table} of status is missing. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)
}
