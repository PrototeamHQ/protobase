import { CLIENT_CAPABILITIES_META_KEY, fromJsonSchema, McpServer, type CallToolResult, type ClientCapabilities, type InputRequiredResult, type ServerContext } from '@modelcontextprotocol/server'
import { checkedTools } from '../assistant/checked-tools'
import type { AssistantTool, ToolContext } from '../assistant/tools'
import { ApprovalNeeded, approvalAsked, approvedUnasked, mcpApproval, writesUnasked } from './mcp-approval'
import type { McpApprovals } from './mcp-approval-store'
import { callHash, callScope, scopeHash } from './mcp-call-hash'
import { isStatementTimeout } from '../statement-timeout'

export type McpServerInput = {
  /** The name, version and title the server tells clients when they connect. */
  info: { name: string; version: string; title?: string }
  tools: AssistantTool[]
  /** What each tool gets as its context, for the caller of the request; `approve` comes from each call's own answers. */
  context: Omit<ToolContext, 'approve'>
  /** Gets the errors a tool throws, which the client only sees as a failure. */
  report: (error: unknown) => void
  /** The roles whose calls are approved without asking the client: a user holding one of them is never asked. None by default. */
  rolesWithoutApproval?: readonly string[]
  /** The approvals asked for and not yet answered, `mcpApprovals()` built once for every server the endpoint builds. */
  approvals: McpApprovals
}

// The SDK's published types leave the envelope's shape empty; on the 2026 protocol it carries the client's capabilities.
const capabilitiesOf = (envelope: object | undefined) => (envelope as Record<string, ClientCapabilities | undefined> | undefined)?.[CLIENT_CAPABILITIES_META_KEY]

// The SDK compiles each schema object it is given into a cache that never lets go, so each parameters object is turned
// into an input schema once: a server built per request from the same tools adds nothing to it.
const inputSchemas = new WeakMap<object, ReturnType<typeof fromJsonSchema<Record<string, unknown>>>>()
const inputSchemaOf = (parameters: AssistantTool['parameters']) => {
  const known = inputSchemas.get(parameters)
  if (known) return known
  const schema = fromJsonSchema<Record<string, unknown>>(parameters)
  inputSchemas.set(parameters, schema)
  return schema
}

const failed: CallToolResult = { content: [{ type: 'text', text: 'The server failed to answer.' }], isError: true }

const stopped = (tool: string): CallToolResult => ({
  content: [{ type: 'text', text: `${tool} ran a query longer than its statement timeout, so the database stopped it. Ask for less, such as with a narrower filter or fewer fields.` }],
  isError: true,
})

/**
 * An MCP server offering `tools` as MCP tools, each with its JSON Schema, its hints, and the text it returns. A tool
 * that asks for approval makes the call ask the client's user, and runs again from the start with their answer, which
 * counts only for the call it was asked for, once, while it lasts; for a user holding one of `rolesWithoutApproval` it
 * is approved at once, and the client is never asked.
 */
export const mcpServer = ({ info, tools, context, report, rolesWithoutApproval = [], approvals }: McpServerInput) => {
  const server = new McpServer(info)
  const unasked = writesUnasked(rolesWithoutApproval, context.session.user.roles)
  for (const tool of checkedTools(tools)) {
    const config = { description: tool.description, inputSchema: inputSchemaOf(tool.parameters), ...(tool.annotations && { annotations: tool.annotations }) }
    const answer = async (args: Record<string, unknown>, ctx: ServerContext): Promise<CallToolResult | InputRequiredResult> => {
      // Bound to the arguments as sent: the tool runs on a copy, so nothing it changes in them changes what is approved.
      const bound = () => {
        const scope = callScope(context.session, ctx.http?.authInfo?.resource)
        return { scope: scopeHash(scope), call: callHash(tool.name, args, scope) }
      }
      const check = (state: unknown) => {
        const { scope, call } = bound()
        return approvals.check(scope, call, state)
      }
      const approve = unasked ? approvedUnasked : mcpApproval({ inputResponses: ctx.mcpReq.inputResponses, requestState: ctx.mcpReq.requestState(), check })
      try {
        return { content: [{ type: 'text', text: await tool.run(structuredClone(args), { ...context, approve }) }] }
      } catch (error) {
        if (!(error instanceof ApprovalNeeded)) throw error
        const { scope, call } = bound()
        return approvalAsked(error.request, capabilitiesOf(ctx.mcpReq.envelope), () => approvals.ask(scope, call))
      }
    }
    server.registerTool(tool.name, config, async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      try {
        return await answer(args, ctx)
      } catch (error) {
        // Whatever a tool throws stays on the server: the client gets no raw message, but one that names a stopped query.
        report(error)
        return isStatementTimeout(error) ? stopped(tool.name) : failed
      }
    })
  }
  return server
}
