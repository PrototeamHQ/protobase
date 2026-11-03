import type { Db } from '@protobase/query'
import { userTableResources } from '@protobase/server'

/** The tables users add, read from their definitions; each one that does not fit the database is printed as a warning and left out, so the rest of the app serves. */
export const readUserTables = async (db: Db) => {
  const tables = await userTableResources(db)
  for (const problem of tables.problems) console.warn(problem)
  return tables
}

