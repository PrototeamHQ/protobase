import { definitionsHook } from './definitions-hook'
import { definitionsResources, fieldsResourceName, tablesResourceName } from './definitions-resources'
import { servedUserTables, type UserTableSources } from './served-user-tables'

/**
 * What the tables users add bring to the admin, with `userTables` on: the resources over their definitions, through
 * which they are created, each user table a name in code (`codeNames`, the app's and Protobase's) does not take, and the
 * hook that creates their tables and columns. Without `tables`, nothing.
 */
export const adminUserTables = (tables: UserTableSources | undefined, codeNames: readonly string[], roles: boolean) => {
  if (!tables) return { resources: [], views: [], hooks: [], warnings: [] }
  const definitions = definitionsResources({ roles, taken: codeNames })
  const served = servedUserTables(tables, [...codeNames, tablesResourceName, fieldsResourceName])
  return { resources: [definitions.tables, definitions.fields, ...served.resources], views: served.views, hooks: [definitionsHook(codeNames)], warnings: served.warnings }
}
