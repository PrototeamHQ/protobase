import type { Db } from '@protobase/query'
import { seesAssistant } from '../assistant/assistant-settings'
import { readOnlyQueryTool } from '../assistant/query-tools'
import { readRecordTools } from '../assistant/record-tools'
import type { AssistantTool } from '../assistant/tools'
import { writeRecordTools, type WriteRecordToolsInput } from '../assistant/write-record-tools'
import { batchWriteTool } from '../assistant/batch-write-tool'
import type { Session } from '../types'
import type { McpWrites } from './mcp-writes'

export type McpToolsInput = {
  db: Db
  /** Offers `run_read_only_query` to callers who see the assistant (`admin` or `ai`); it reads outside the access rules. */
  sql: boolean
  /**
   * Offers `create_record`, `update_record`, `delete_record` and `batch_write`, on the listed resources only when given
   * `{ resources }`; each write still needs the caller's role, and their approval in the client unless they hold one of
   * `rolesWithoutApproval`.
   */
  writes: McpWrites
}

/**
 * The default MCP tools for a caller: the record tools, the write tools when `writes` is on, and read-only SQL when `sql`
 * is on and the caller sees the assistant.
 */
const writeTools = (input: WriteRecordToolsInput) => [...writeRecordTools(input), batchWriteTool(input)]

export const mcpTools = ({ db, sql, writes }: McpToolsInput) => (session: Session): AssistantTool[] => [
  ...readRecordTools(),
  ...(writes === false ? [] : writeTools(writes === true || !writes.resources ? {} : { resources: writes.resources })),
  ...(sql && seesAssistant(session.user.roles) ? [readOnlyQueryTool(db)] : []),
]
