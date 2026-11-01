import { CLIENT_CAPABILITIES_META_KEY, McpServer, type CallToolResult, type ClientCapabilities, type Icon, type InputRequiredResult, type ServerContext } from '@modelcontextprotocol/server'
import { checkedTools } from '../assistant/checked-tools'
import { refusalOf } from '../assistant/record-tool-args'
import type { AssistantTool, BaseToolContext, ToolContext } from '../assistant/tools'
import { ApprovalNeeded, approvalAsked, approvedUnasked, mcpApproval, writesUnasked } from './mcp-approval'
import type { McpApprovals } from './mcp-approval-store'
import { callHash, callScope, scopeHash } from './mcp-call-hash'
import { inputSchemaMemo } from './mcp-input-schemas'
import { mcpInstructions } from './mcp-instructions'
import { isStatementTimeout } from '../statement-timeout'

export type McpServerInput<Context extends BaseToolContext = ToolContext> = {
  /** The name, version, title and icons the server tells clients when they connect, each icon an absolute URL. */
  info: { name: string; version: string; title?: string; icons?: Icon[] }
  /** What the server tells clients about using it when they connect; `mcpInstructions`, on reading records, by default. */
  instructions?: string
  tools: AssistantTool<Context>[]
  /**
   * What each tool gets as its context, for the caller of the request; `approve` comes from each call's own answers.
   * A `ToolContext`, with the app's records, unless every tool takes a smaller one, such as `BaseToolContext`.
   */
  context: Omit<Context, 'approve'>
  /** Gets the errors a tool throws other than refusals, which the client only sees as a failure. */
  report: (error: unknown) => void
  /** The roles whose calls are approved without asking the client: a user holding one of them is never asked. None by default. */
  rolesWithoutApproval?: readonly string[]
  /** The approvals asked for and not yet answered, `mcpApprovals()` built once for every server the endpoint builds. */
  approvals: McpApprovals
}

// The SDK's published types leave the envelope's shape empty; on the 2026 protocol it carries the client's capabilities.
const capabilitiesOf = (envelope: object | undefined) => (envelope as Record<string, ClientCapabilities | undefined> | undefined)?.[CLIENT_CAPABILITIES_META_KEY]

// Far more than the tools any app offers, so only schemas no server uses any more are dropped.
const inputSchemaOf = inputSchemaMemo(1000)

const failed: CallToolResult = { content: [{ type: 'text', text: 'The server failed to answer.' }], isError: true }

const refusal = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true })

const stopped = (tool: string): CallToolResult => ({
  content: [{ type: 'text', text: `${tool} ran a query longer than its statement timeout, so the database stopped it. Ask for less, such as with a narrower filter or fewer fields.` }],
  isError: true,
})

/**
 * An MCP server offering `tools` as MCP tools, each with its JSON Schema, its hints, its `title` and `_meta`, and the
 * text it returns. A tool that throws an `HttpProblem` below 500, or a query error the REST API would answer below 500,
 * refuses the call with `{ error, message }`, unreported; anything else it throws is reported and fails the call. A tool
 * that asks for approval makes the call ask the client's user, and runs again from the start with their answer, which
 * counts only for the call it was asked for, once, while it lasts; for a user holding one of `rolesWithoutApproval` it
 * is approved at once, and the client is never asked.
 */
export const mcpServer = <Context extends BaseToolContext = ToolContext>({ info, instructions = mcpInstructions, tools, context, report, rolesWithoutApproval = [], approvals }: McpServerInput<Context>) => {
  const server = new McpServer(info, { instructions })
  const unasked = writesUnasked(rolesWithoutApproval, context.session.user.roles)
  for (const tool of checkedTools(tools)) {
    const config = {
      description: tool.description,
      inputSchema: inputSchemaOf(tool.parameters),
      ...(tool.title !== undefined && { title: tool.title }),
      ...(tool.annotations && { annotations: tool.annotations }),
      ...(tool._meta && { _meta: tool._meta }),
    }
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
        // The context without `approve`, given it back: TypeScript cannot tell that this makes a whole `Context`.
        return { content: [{ type: 'text', text: await tool.run(structuredClone(args), { ...context, approve } as Context) }] }
      } catch (error) {
        if (!(error instanceof ApprovalNeeded)) throw error
        const { scope, call } = bound()
        return approvalAsked(error.request, capabilitiesOf(ctx.mcpReq.envelope), () => approvals.ask(scope, call), context.locale)
      }
    }
    server.registerTool(tool.name, config, async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      try {
        return await answer(args, ctx)
      } catch (error) {
        const refusing = refusalOf(error)
        if (refusing !== undefined) return refusal(refusing)
        // Whatever else a tool throws stays on the server: the client gets no raw message, but one that names a stopped query.
        report(error)
        return isStatementTimeout(error) ? stopped(tool.name) : failed
      }
    })
  }
  return server
}
