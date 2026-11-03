import { tableIndexes, type Db } from '@protobase/query'
import { checkDefinition, type CheckedDefinition } from './check-definition'
import { definitionResource } from './definition-resource'
import { readDefinitions, readUserTableColumns } from './read-definitions'

/**
 * What the stored definitions serve: a resource and view for each that fits the database, the definitions they are
 * built from, as `protobase eject` writes them into code, and why each other one is left out.
 */
export type UserTables = { resources: Array<ReturnType<typeof definitionResource>['resource']>; views: Array<ReturnType<typeof definitionResource>['view']>; definitions: CheckedDefinition[]; problems: string[] }

/**
 * The resources of the tables users add, from their definitions and the catalogue: a definition that does not fit the
 * database is left out with a problem, so the rest of the app serves. Filters, sorts and search are claimed only where
 * the table's indexes serve them, read as the scan guard reads them.
 */
export const userTableResources = async (db: Db): Promise<UserTables> => {
  const [definitions, columns] = await Promise.all([readDefinitions(db), readUserTableColumns(db)])
  const tables: UserTables = { resources: [], views: [], definitions: [], problems: [] }
  for (const stored of definitions) {
    const checked = checkDefinition(stored, columns)
    if ('problem' in checked) {
      tables.problems.push(checked.problem)
      continue
    }
    const indexes = await tableIndexes(db, definitionResource(checked.definition).resource.toModel())
    const { resource, view } = definitionResource(checked.definition, indexes)
    tables.resources.push(resource)
    tables.views.push(view)
    tables.definitions.push(checked.definition)
  }
  return tables
}
