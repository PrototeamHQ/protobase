import type { AssistantPart } from '@protobase/schema'
import type { Session } from '../types'
import type { ApprovalAnswer, ApprovalRequest } from './approval'
import type { Conversation } from './conversations'

export type ToolContext = {
  session: Session
  conversation: Conversation
  /** Adds a part, such as a table of results, to the assistant message the turn is writing. */
  show: (part: AssistantPart) => void
  /** Asks the user to approve with a card in that message (see `requestApproval`). */
  approve: (request: ApprovalRequest) => Promise<ApprovalAnswer>
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
}

/** Typed identity, for a tool of your own. */
export const defineTool = (tool: AssistantTool) => tool
