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
  /** The app's resources as the session's user, through their access rules and write hooks (built-in assistant only). */
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

/**
 * A function the model may call during a turn. `parameters` is the JSON Schema of its arguments; `run` gets them
 * parsed, but not checked against the schema, and returns what the model reads as the result.
 */
export type AssistantTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, unknown>, context: ToolContext) => Promise<string>
  annotations?: ToolAnnotations
}

/** Typed identity, for a tool of your own. */
export const defineTool = (tool: AssistantTool) => tool
