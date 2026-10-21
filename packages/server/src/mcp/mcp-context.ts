import { assistantRecords } from '../assistant/records'
import { readableResources } from '../assistant/readable-resources'
import type { ToolContext } from '../assistant/tools'
import type { Deps } from '../deps'
import type { Meta } from '../meta'
import type { Session } from '../types'

/**
 * What tools get over MCP for `session`: the records and resources it may read, under its access rules. Nothing shows
 * beside a tool's result, and asking for approval fails: no read tool asks, and approval over MCP comes with writes.
 */
export const mcpToolContext = (deps: Deps, meta: Pick<Meta, 'forCaller'>, session: Session): ToolContext => ({
  session,
  records: assistantRecords(deps, session),
  resources: () => readableResources(meta, session),
  show: () => {},
  approve: () => Promise.reject(new Error('Not implemented: MCP tools cannot ask for approval yet')),
})
