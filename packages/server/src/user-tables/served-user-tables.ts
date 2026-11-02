import type { ResourceSource } from '../resource-source'
import type { ViewSource } from '../types'

/** The resources and views of the tables users add, as `userTableResources` builds them. */
export type UserTableSources = { resources: ResourceSource[]; views: ViewSource[] }

/**
 * The user tables a name of the app's own or a built-in resource does not take, and a warning for each one it does: a
 * resource in code of the same name wins, which is how a table taken over as code hands over. Of two with one name, the
 * first is kept.
 */
export const servedUserTables = (tables: UserTableSources, taken: readonly string[]) => {
  const names = new Set(taken)
  const kept: UserTableSources = { resources: [], views: [] }
  const warnings: string[] = []
  for (const source of tables.resources) {
    const { name } = source.toModel()
    if (names.has(name)) {
      warnings.push(`The user table "${name}" is not served: a resource of the app has its name.`)
      continue
    }
    names.add(name)
    kept.resources.push(source)
    kept.views.push(...tables.views.filter((view) => view.toModel().resource === name).slice(0, 1))
  }
  return { ...kept, warnings }
}
