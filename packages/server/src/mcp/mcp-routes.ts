import type { Env, Hono } from 'hono'
import { cors } from 'hono/cors'

export type McpRoutesInput = {
  path: string
  handler: (request: Request) => Promise<Response>
}

/**
 * Serves the MCP endpoint at `path`, callable from any origin: a client in a browser sends its token, never cookies.
 * A preflight gets back the headers it asks for, such as `authorization`, `dpop` and `mcp-protocol-version`.
 */
export const mcpRoutes = <E extends Env>(app: Hono<E>, { path, handler }: McpRoutesInput) => {
  app.use(path, cors({ origin: '*', exposeHeaders: ['www-authenticate', 'mcp-session-id'] }))
  app.all(path, (c) => handler(c.req.raw))
}

/**
 * Answers 404 at `path` and under it, to every method and before any token check, where the host serves its own MCP
 * endpoint in front of this app. It answers itself rather than through `c.notFound()`, which a host mounting this app
 * would answer with its own page.
 */
export const closedMcpRoutes = <E extends Env>(app: Hono<E>, path: string) => {
  app.all(path, (c) => c.text('404 Not Found', 404))
  app.all(`${path}/*`, (c) => c.text('404 Not Found', 404))
}
