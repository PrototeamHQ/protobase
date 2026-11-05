import type { Db } from '@protobase/query'
import { seesAssistant } from '../assistant/assistant-settings'
import { readOnlyQueryTool } from '../assistant/query-tools'
import { readRecordTools } from '../assistant/record-tools'
import type { AssistantTool } from '../assistant/tools'
import { writeRecordTools, type WriteRecordToolsInput } from '../assistant/write-record-tools'
import { batchWriteTool } from '../assistant/batch-write-tool'
import { commentTools } from '../assistant/comment-tools'
import { checkedTools } from '../assistant/checked-tools'
import type { Session } from '../types'
import type { McpWrites } from './mcp-writes'
import { workflowReadTools, type WorkflowCatalog } from '../workflows/mcp/workflow-read-tools'
import { workflowWriteTools } from '../workflows/mcp/workflow-write-tools'
import { webhookTools } from '../workflows/mcp/webhook-tools'

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
  /**
   * The resources whose records take comments: offers `list_comments` on them, and `add_comment` with writes on, on
   * those of them that `writes` lists when it lists some. None by default.
   */
  commented?: string[]
  /**
   * Offers the workflow tools, for an app with `workflows`: reading workflows, their types and runs, and checking
   * definitions against the app's types; with writes on, `create_workflow`, `update_workflow`, `run_workflow`,
   * `enable_workflow` and `new_webhook_url` too.
   * Off by default.
   */
  workflows?: WorkflowCatalog
  /** The app's own tools, offered to every caller after the built-in ones. */
  own?: AssistantTool[]
}

const writeTools = (input: WriteRecordToolsInput) => [...writeRecordTools(input), batchWriteTool(input)]

// Every name a built-in tool may take, whatever the options: an own tool cannot take one that turning an option on would offer.
const builtInNames = (db: Db) => new Set([...readRecordTools(), ...writeTools({}), ...commentTools({ commented: ['comments'] }, {}), readOnlyQueryTool(db), ...workflowReadTools({ types: [], checkWith: () => ({ resources: [], triggers: {} }) }), ...workflowWriteTools(), ...webhookTools({}, () => Promise.reject(new Error('Not called')))].map((tool) => tool.name))

/** The app's own tools; one whose name is taken twice, or by a built-in tool, stops the server at startup. */
const checkedOwnTools = (db: Db, own: AssistantTool[]) => {
  const builtIn = builtInNames(db)
  const taken = own.find((tool) => builtIn.has(tool.name))
  if (taken) throw new Error(`The MCP tool "${taken.name}" has the name of a built-in MCP tool; give it another name`)
  return checkedTools(own)
}

/**
 * The MCP tools for a caller: the record tools, the write tools when `writes` is on, the comment tools when a resource
 * takes comments, the workflow tools with `workflows`, read-only SQL when `sql` is on and the caller sees the
 * assistant, then the app's own tools. The
 * tools are built once and only chosen per session: the MCP server compiles each tool's schema, and a schema object made
 * per request would be compiled again.
 */
export const mcpTools = ({ db, sql, writes, commented = [], workflows, own = [] }: McpToolsInput) => {
  const ownTools = checkedOwnTools(db, own)
  const read = readRecordTools()
  const limits = writes === false ? false : writes === true || !writes.resources ? {} : { resources: writes.resources }
  const write = limits === false ? [] : writeTools(limits)
  const comments = commentTools({ commented }, limits)
  const flows = workflows ? [...workflowReadTools(workflows), ...(limits === false ? [] : [...workflowWriteTools(limits), ...webhookTools(limits, workflows.issueWebhook)])] : []
  const query = sql ? [readOnlyQueryTool(db)] : []
  return (session: Session): AssistantTool[] => [...read, ...write, ...comments, ...flows, ...(seesAssistant(session.user.roles) ? query : []), ...ownTools]
}
