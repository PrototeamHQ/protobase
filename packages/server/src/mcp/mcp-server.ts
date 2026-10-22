import { CLIENT_CAPABILITIES_META_KEY, fromJsonSchema, McpServer, type CallToolResult, type ClientCapabilities, type InputRequiredResult } from '@modelcontextprotocol/server'
import { checkedTools } from '../assistant/checked-tools'
import type { AssistantTool, ToolContext } from '../assistant/tools'
import { ApprovalNeeded, approvalAsked, mcpApproval } from './mcp-approval'

export type McpServerInput = {
  /** The name, version and title the server tells clients when they connect. */
  info: { name: string; version: string; title?: string }
  tools: AssistantTool[]
  /** What each tool gets as its context, for the caller of the request; `approve` comes from each call's own answers. */
  context: Omit<ToolContext, 'approve'>
  /** Gets the errors a tool throws, which the client only sees as a failure. */
  report: (error: unknown) => void
}

// The SDK's published types leave the envelope's shape empty; on the 2026 protocol it carries the client's capabilities.
const capabilitiesOf = (envelope: object | undefined) => (envelope as Record<string, ClientCapabilities | undefined> | undefined)?.[CLIENT_CAPABILITIES_META_KEY]

const failed: CallToolResult = { content: [{ type: 'text', text: 'The server failed to answer.' }], isError: true }

/**
 * An MCP server offering `tools` as MCP tools, each with its JSON Schema, its hints, and the text it returns. A tool
 * that asks for approval makes the call ask the client's user, and runs again from the start with their answer.
 */
export const mcpServer = ({ info, tools, context, report }: McpServerInput) => {
  const server = new McpServer(info)
  for (const tool of checkedTools(tools)) {
    const config = { description: tool.description, inputSchema: fromJsonSchema<Record<string, unknown>>(tool.parameters), ...(tool.annotations && { annotations: tool.annotations }) }
    server.registerTool(tool.name, config, async (args, ctx): Promise<CallToolResult | InputRequiredResult> => {
      try {
        return { content: [{ type: 'text', text: await tool.run(args, { ...context, approve: mcpApproval(ctx.mcpReq.inputResponses) }) }] }
      } catch (error) {
        if (error instanceof ApprovalNeeded) return approvalAsked(error.request, capabilitiesOf(ctx.mcpReq.envelope))
        // Whatever a tool throws stays on the server: the client gets no raw message.
        report(error)
        return failed
      }
    })
  }
  return server
}
