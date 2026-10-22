import type { AdminOptions } from '../admin-options'
import type { Authenticator } from '../types'

type AudienceAuthenticator = Authenticator & { forAudience: (audience: string) => Authenticator }

const hasAudiences = (authenticate: Authenticator): authenticate is AudienceAuthenticator => typeof (authenticate as Partial<AudienceAuthenticator>).forAudience === 'function'

// Anything else, such as `'false'`, `null` or `{ enabled: false }`, would serve the endpoint as if `options.mcp` were unset.
const isMcpOptions = (options: unknown) =>
  options === undefined ||
  options === false ||
  (typeof options === 'object' && options !== null && !Array.isArray(options) && Object.entries(options).every(([name, value]) => (name === 'sql' || name === 'writes') && (value === undefined || typeof value === 'boolean')))

/**
 * The authenticator of the MCP endpoint's tokens, when MCP is on (`createAuth({ mcp })`); none when the host serves its
 * own (`options.mcp: false`). Stops the server at startup when `options.mcp` is neither `false` nor
 * `{ sql?: boolean; writes?: boolean }`, when it is set without MCP, or when `authenticate` cannot verify tokens for
 * another audience.
 */
export const mcpAuthenticator = (authenticate: Authenticator, mcp: { resource: string } | undefined, options: AdminOptions['mcp']) => {
  if (!isMcpOptions(options)) throw new Error('options.mcp takes false or { sql?: boolean, writes?: boolean }')
  if (options === false) return undefined
  if (options && !mcp) throw new Error('options.mcp needs createAuth({ mcp }) passed as auth')
  if (!mcp) return undefined
  if (!hasAudiences(authenticate)) throw new Error('MCP needs authenticate from betterAuthAuthenticator, whose forAudience verifies the MCP tokens')
  return authenticate.forAudience(mcp.resource)
}
