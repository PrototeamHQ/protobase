import { assistantRecords } from '../assistant/records'
import { readableResources } from '../assistant/readable-resources'
import type { ToolContext } from '../assistant/tools'
import type { Deps } from '../deps'
import type { Meta } from '../meta'
import type { Session } from '../types'

/**
 * What tools get over MCP for `session`: its records and the resources it may read, under its access rules. Nothing
 * shows beside a tool's result, and `mcpServer` gives each call its own `approve`.
 */
export const mcpToolContext = (deps: Deps, meta: Pick<Meta, 'forCaller'>, session: Session): Omit<ToolContext, 'approve'> => ({
  session,
  records: assistantRecords(deps, session),
  resources: () => readableResources(meta, session),
  show: () => {},
})
