import type { Db } from '@protobase/query'
import { userTableResources } from '@protobase/server/config-exports'
import type { ResourceModel } from '@protobase/schema'
import type { Issue } from './check'

/**
 * The models of the tables users add, which doctor checks like the config's, and an error for each definition that
 * does not fit the database or whose name a resource in code has, as the server leaves those out.
 */
export const userTableModels = async (db: Db, codeModels: readonly ResourceModel[]) => {
  const tables = await userTableResources(db)
  const taken = new Set(codeModels.map((model) => model.name))
  const built = tables.resources.map((source) => source.toModel())
  const issues: Issue[] = [
    ...tables.problems.map((message): Issue => ({ severity: 'error', resource: 'user tables', message })),
    ...built.filter((model) => taken.has(model.name)).map((model): Issue => ({ severity: 'warning', resource: model.name, message: 'a resource in code has the name of this user table, which is not served' })),
  ]
  return { models: built.filter((model) => !taken.has(model.name)), issues }
}
