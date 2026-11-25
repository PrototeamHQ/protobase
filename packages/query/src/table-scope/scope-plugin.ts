import type { KyselyPlugin, PluginTransformQueryArgs, PluginTransformResultArgs, QueryResult, RootOperationNode, UnknownRow } from 'kysely'
import { currentOrganization, isEveryOrganization, type ScopeOrganization } from './organization-source'
import type { ScopedTables } from './scoped-tables'
import { ScopeTransformer } from './scope-transformer'

/**
 * Keeps each query on a scoped table to `organization` (see `ScopeTransformer`); with none, a query sees no scoped
 * row and an insert into one is refused. An `OrganizationSource` is read as each query is built: a query it gives
 * every organization for passes as it is, and its raw `scoped(t)` fails as on a database without the scope.
 */
export class ScopePlugin implements KyselyPlugin {
  constructor(
    readonly scope: ScopedTables,
    readonly organization: ScopeOrganization,
  ) {}

  // A transformer per query: one that throws, such as on a refused insert, leaves its state behind with it.
  transformQuery({ node }: PluginTransformQueryArgs): RootOperationNode {
    const organization = currentOrganization(this.organization)
    if (isEveryOrganization(organization)) return node
    return new ScopeTransformer(this.scope, organization).transformNode(node)
  }

  async transformResult({ result }: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return result
  }
}
