import type { KyselyPlugin, PluginTransformQueryArgs, PluginTransformResultArgs, QueryResult, RootOperationNode, UnknownRow } from 'kysely'
import type { Organization } from './scope-condition'
import type { ScopedTables } from './scoped-tables'
import { ScopeTransformer } from './scope-transformer'

/**
 * Keeps each query on a scoped table to `organization` (see `ScopeTransformer`); with none, a query sees no scoped
 * row and an insert into one is refused.
 */
export class ScopePlugin implements KyselyPlugin {
  constructor(
    readonly scope: ScopedTables,
    readonly organization: Organization,
  ) {}

  // A transformer per query: one that throws, such as on a refused insert, leaves its state behind with it.
  transformQuery({ node }: PluginTransformQueryArgs): RootOperationNode {
    return new ScopeTransformer(this.scope, this.organization).transformNode(node)
  }

  async transformResult({ result }: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return result
  }
}
