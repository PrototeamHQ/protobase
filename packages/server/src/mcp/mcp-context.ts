import { assistantRecords } from '../assistant/records'
import { readableResources } from '../assistant/readable-resources'
import type { Locale } from '@protobase/schema/internal'
import type { ToolContext } from '../assistant/tools'
import type { Deps } from '../deps'
import type { Meta } from '../meta'
import type { Session } from '../types'

/**
 * What tools get over MCP for `session`: its records and the resources it may read, under its access rules, and
 * `locale`, the language its approvals are asked in. Nothing shows beside a tool's result, and `mcpServer` gives each
 * call its own `approve`.
 */
export const mcpToolContext = (deps: Deps, meta: Pick<Meta, 'forCaller'>, session: Session, locale?: Locale): Omit<ToolContext, 'approve'> => ({
  session,
  ...(locale && { locale }),
  records: assistantRecords(deps, session),
  resources: () => readableResources(meta, session),
  show: () => {},
})
