import type { AssistantPart, ResourceModel, ViewModel } from '@protobase/schema'
import type { Locale } from '@protobase/schema/internal'
import type { ToolComments } from '../comments/tool-comment-types'
import type { Session } from '../types'
import type { ApprovalAnswer, ApprovalRequest } from './approval'
import type { Conversation } from './conversations'
import type { ToolRecords } from './records'

/** The resources a caller may read, each restricted to their fields, with their views. */
export type ReadableResources = { models: ResourceModel[]; views: ViewModel[] }

export type ToolContext = {
  session: Session
  /** The language the user reads, for the texts a tool shows them such as its approvals; English when absent. */
  locale?: Locale
  /** The dock's conversation; absent over MCP. */
  conversation?: Conversation
  /** Adds a part, such as a table of results, to the assistant message the turn is writing. */
  show: (part: AssistantPart) => void
  /** Asks the user to approve with a card in that message (see `requestApproval`). */
  approve: (request: ApprovalRequest) => Promise<ApprovalAnswer>
  /** The app's resources as the session's user, through their access rules and write hooks. */
  records: ToolRecords
  /** The resources the caller may read, each restricted to their fields, with their views. */
  resources: () => Promise<ReadableResources>
  /** Records' comments as the session's user, which the MCP endpoint gives its tools; absent elsewhere. */
  comments?: ToolComments
}

/** MCP's tool hints, which an MCP client may show or act on; the dock ignores them. */
export type ToolAnnotations = {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/** What every tool's context holds: a host's own MCP server, with no app records, gives its tools no more. */
export type BaseToolContext = Pick<ToolContext, 'session' | 'locale' | 'approve'>

/**
 * A function the model may call during a turn. `parameters` is the JSON Schema of its arguments; `run` gets them
 * parsed, checked against the schema over MCP but not in the dock, and returns what the model reads as the result.
 * `run` gets a `ToolContext` unless the tool names a smaller one, such as `BaseToolContext` for a host's MCP server.
 */
export type AssistantTool<Context extends BaseToolContext = ToolContext> = {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, unknown>, context: Context) => Promise<string>
  annotations?: ToolAnnotations
  /** MCP's display name for the tool, which `tools/list` gives as is; the dock ignores it. */
  title?: string
  /** MCP's `_meta` for the tool, such as `securitySchemes`, which `tools/list` gives as is; the dock ignores it. */
  _meta?: Record<string, unknown>
}

/** Typed identity, for a tool of your own. */
export const defineTool = <Context extends BaseToolContext = ToolContext>(tool: AssistantTool<Context>) => tool
