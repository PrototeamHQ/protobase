import type { Db } from '@protobase/query'
import { ownedTableNames, userTableResources } from '@protobase/server/config-exports'
import type { ResourceModel } from '@protobase/schema'
import type { Issue } from './check'

/**
 * The models of the tables users add, which doctor checks like the config's, an error for each definition that does
 * not fit the database, and a warning for each whose name a resource in code has, as the server leaves those out: one
 * that code owns, as `protobase eject` writes it, waits for `protobase migration` to delete its definition.
 */
export const userTableModels = async (db: Db, codeModels: readonly ResourceModel[]) => {
  const tables = await userTableResources(db)
  const taken = new Set(codeModels.map((model) => model.name))
  const owned = new Set(ownedTableNames(codeModels))
  const built = tables.resources.map((source) => source.toModel())
  const takenIssue = (name: string): Issue =>
    owned.has(name)
      ? { severity: 'warning', resource: name, message: 'a resource in code owns this user table now; once that code has deployed, `protobase migration` writes the delete of its definition' }
      : { severity: 'warning', resource: name, message: 'a resource in code has the name of this user table, which is not served' }
  const issues: Issue[] = [
    ...tables.problems.map((message): Issue => ({ severity: 'error', resource: 'user tables', message })),
    ...built.filter((model) => taken.has(model.name)).map((model) => takenIssue(model.name)),
  ]
  return { models: built.filter((model) => !taken.has(model.name)), issues }
}
