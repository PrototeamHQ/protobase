import type { KyselyPlugin, PluginTransformQueryArgs, PluginTransformResultArgs, QueryResult, RootOperationNode, UnknownRow } from 'kysely'
import type { Organization } from './scope-condition'
import type { ScopedTables } from './scoped-tables'
import { ScopeTransformer } from './scope-transformer'

/**
 * Keeps each query on a scoped table to `organization` (see `ScopeTransformer`); with none, a query sees no scoped
 * row and an insert into one is refused.
 */
export class ScopePlugin implements KyselyPlugin {
  readonly #transformer: ScopeTransformer

  constructor(scope: ScopedTables, organization: Organization) {
    this.#transformer = new ScopeTransformer(scope, organization)
  }

  transformQuery({ node }: PluginTransformQueryArgs): RootOperationNode {
    return this.#transformer.transformNode(node)
  }

  async transformResult({ result }: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return result
  }
}
