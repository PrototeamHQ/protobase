import type { BetterAuthPlugin } from 'better-auth'
import type { getMigrations } from 'better-auth/db/migration'
import type { AdminAuth } from '../create-auth'
import { pluginNames } from '../snake-case-names'

// The tables of the OAuth provider MCP clients sign in through, in the auth store. Turning MCP off drops them, so no
// client or grant outlives the flag and turning it on again starts from nothing.

type Plan = Pick<Awaited<ReturnType<typeof getMigrations>>, 'toBeCreated'>

/** The database names of MCP's tables. */
export const mcpTableNames = Object.values(pluginNames.mcp).map(({ modelName }) => modelName)

// MCP's tables with no fields: named only so that the migration planner, with MCP off, reports whether they exist.
const mcpTablesPlugin = {
  id: 'protobase-mcp-tables',
  schema: Object.fromEntries(Object.entries(pluginNames.mcp).map(([model, { modelName }]) => [model, { modelName, fields: {} }])),
} satisfies BetterAuthPlugin

/** The auth's options, which with MCP off also name MCP's tables, for a plan that tells whether they are left over. */
export const withMcpTables = (auth: Pick<AdminAuth, 'mcp' | 'options'>) => (auth.mcp ? auth.options : { ...auth.options, plugins: [...(auth.options.plugins ?? []), mcpTablesPlugin] })

/** The MCP tables the store still has while MCP is off, from a plan made with `withMcpTables`; none with MCP on. */
export const leftoverMcpTables = (auth: Pick<AdminAuth, 'mcp'>, { toBeCreated }: Plan) => {
  if (auth.mcp) return []
  const missing = new Set(toBeCreated.map(({ table }) => table))
  return mcpTableNames.filter((table) => !missing.has(table))
}

const schemaName = /^[a-z_][a-z0-9_]*$/

/** The statement that drops MCP's tables, in `schema` or the connection's current one. */
export const dropMcpTables = (schema?: string) => {
  if (schema !== undefined && !schemaName.test(schema)) throw new Error(`Invalid auth schema name "${schema}"`)
  const s = schema === undefined ? '' : `"${schema}".`
  return `-- MCP is off: dropping the tables of its OAuth provider disconnects every MCP client and forgets every grant.
drop table if exists ${mcpTableNames.map((table) => `${s}"${table}"`).join(', ')};`
}
