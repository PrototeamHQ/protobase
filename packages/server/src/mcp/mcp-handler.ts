import { createMcpHandler, hostHeaderValidationResponse, type McpServer } from '@modelcontextprotocol/server'
import type { Session } from '../types'
import { mcpGate, sessionOf, type McpGateInput } from './mcp-gate'

export type McpHandlerInput = McpGateInput & {
  /**
   * Builds the server for the caller of one request, such as `mcpServer(...)` with tools of your own registered on it;
   * `request` is the HTTP request it serves, such as for the language its user reads.
   */
  server: (session: Session, request: Request | undefined) => McpServer | Promise<McpServer>
}

/**
 * The MCP endpoint as a fetch handler: refuses a request addressed to another host than the resource's, then one
 * without a valid token (see `mcpGate`), and serves the rest with the server `server` builds for its caller. Each
 * request is served on its own, without a session: a GET or DELETE answers 405.
 */
export const mcpHandler = ({ server, ...gate }: McpHandlerInput) => {
  const hostname = new URL(gate.resource).hostname
  const admit = mcpGate(gate)
  const handler = createMcpHandler((context) => server(sessionOf(context.authInfo), context.requestInfo), { legacy: 'stateless' })
  return async (request: Request): Promise<Response> => {
    const wrongHost = hostHeaderValidationResponse(request, [hostname])
    if (wrongHost) return wrongHost
    const authInfo = await admit(request)
    if (authInfo instanceof Response) return authInfo
    return handler.fetch(request, { authInfo })
  }
}
