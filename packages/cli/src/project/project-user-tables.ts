import type { Db } from '@protobase/query'
import { userTableResources } from '@protobase/server'
import type { BuiltProject } from '../config/build-project'

/**
 * The tables users add, read from their definitions when the project turns `userTables` on, nothing otherwise, even
 * when the definitions are in the database. Each definition that does not fit the database is printed as a warning and
 * left out, so the rest of the app serves.
 */
export const projectUserTables = async (project: BuiltProject, db: Db) => {
  if (!project.userTables) return
  const tables = await userTableResources(db)
  for (const problem of tables.problems) console.warn(problem)
  return tables
}
