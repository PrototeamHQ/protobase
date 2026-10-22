import type { Db } from '@protobase/query'
import { seesAssistant } from '../assistant/assistant-settings'
import { readOnlyQueryTool } from '../assistant/query-tools'
import { readRecordTools } from '../assistant/record-tools'
import type { AssistantTool } from '../assistant/tools'
import { writeRecordTools } from '../assistant/write-record-tools'
import type { Session } from '../types'

export type McpToolsInput = {
  db: Db
  /** Offers `run_read_only_query` to callers who see the assistant (`admin` or `ai`); it reads outside the access rules. */
  sql: boolean
  /** Offers `create_record` and `update_record`; each write still needs the caller's role and their approval in the client. */
  writes: boolean
}

/**
 * The default MCP tools for a caller: the record tools, the write tools when `writes` is on, and read-only SQL when `sql`
 * is on and the caller sees the assistant.
 */
export const mcpTools = ({ db, sql, writes }: McpToolsInput) => (session: Session): AssistantTool[] => [
  ...readRecordTools(),
  ...(writes ? writeRecordTools() : []),
  ...(sql && seesAssistant(session.user.roles) ? [readOnlyQueryTool(db)] : []),
]
