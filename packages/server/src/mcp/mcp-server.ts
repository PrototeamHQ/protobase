import { fromJsonSchema, McpServer, type CallToolResult } from '@modelcontextprotocol/server'
import { checkedTools } from '../assistant/checked-tools'
import type { AssistantTool, ToolContext } from '../assistant/tools'

export type McpServerInput = {
  /** The name, version and title the server tells clients when they connect. */
  info: { name: string; version: string; title?: string }
  tools: AssistantTool[]
  /** What each tool gets as its context, for the caller of the request. */
  context: ToolContext
  /** Gets the errors a tool throws, which the client only sees as a failure. */
  report: (error: unknown) => void
}

const failed: CallToolResult = { content: [{ type: 'text', text: 'The server failed to answer.' }], isError: true }

/** An MCP server offering `tools` as MCP tools, each with its JSON Schema, its hints, and the text it returns. */
export const mcpServer = ({ info, tools, context, report }: McpServerInput) => {
  const server = new McpServer(info)
  for (const tool of checkedTools(tools)) {
    const config = { description: tool.description, inputSchema: fromJsonSchema<Record<string, unknown>>(tool.parameters), ...(tool.annotations && { annotations: tool.annotations }) }
    server.registerTool(tool.name, config, async (args): Promise<CallToolResult> => {
      try {
        return { content: [{ type: 'text', text: await tool.run(args, context) }] }
      } catch (error) {
        // Whatever a tool throws stays on the server: the client gets no raw message.
        report(error)
        return failed
      }
    })
  }
  return server
}
