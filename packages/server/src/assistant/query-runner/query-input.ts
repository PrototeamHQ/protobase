import type { ResourceModel } from '@protobase/schema'
import { storeAuthTables } from '../../better-auth/auth-tables'
import type { StoreNames } from '../../better-auth/store/store-names'
import type { ModuleInput, ResourceInput, TableName } from '../../schema-modules/schema-module'

// A table named without a schema is taken to be in `public`, as Protobase's own SQL names it.
const same = (a: TableName, b: TableName) => a.name === b.name && (a.schema ?? 'public') === (b.schema ?? 'public')

/**
 * What the query module takes from the app: each resource's table the role reads, by resource, but a table of the auth
 * store `store` names or of one of its guarded schemas, and a table an earlier resource has already, so taking one
 * resource's grants back never takes another's.
 */
export const queryInput = (models: readonly ResourceModel[], store: StoreNames | undefined): ModuleInput => {
  const guarded = store ? storeAuthTables(store) : { tables: [], schemas: [] }
  const grants: Record<string, ResourceInput> = {}
  for (const model of models) {
    const table = { ...(model.table.schema !== undefined && { schema: model.table.schema }), name: model.table.name }
    if (table.schema !== undefined && guarded.schemas.includes(table.schema)) continue
    if (guarded.tables.some((auth) => same(auth, table)) || Object.values(grants).some((given) => same(given.table, table))) continue
    grants[model.name] = { table, input: table }
  }
  return { names: {}, resources: { grants } }
}
