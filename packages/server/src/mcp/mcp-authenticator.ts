import type { Authenticator } from '../types'

type AudienceAuthenticator = Authenticator & { forAudience: (audience: string) => Authenticator }

const hasAudiences = (authenticate: Authenticator): authenticate is AudienceAuthenticator => typeof (authenticate as Partial<AudienceAuthenticator>).forAudience === 'function'

/**
 * The authenticator of the MCP endpoint's tokens, when MCP is on (`createAuth({ mcp })`). Stops the server at startup
 * when `options.mcp` is set without MCP, or when `authenticate` cannot verify tokens for another audience.
 */
export const mcpAuthenticator = (authenticate: Authenticator, mcp: { resource: string } | undefined, options: object | undefined) => {
  if (options && !mcp) throw new Error('options.mcp needs createAuth({ mcp }) passed as auth')
  if (!mcp) return undefined
  if (!hasAudiences(authenticate)) throw new Error('MCP needs authenticate from betterAuthAuthenticator, whose forAudience verifies the MCP tokens')
  return authenticate.forAudience(mcp.resource)
}
