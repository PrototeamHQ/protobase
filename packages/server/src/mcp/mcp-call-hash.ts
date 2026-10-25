import { createHash } from 'node:crypto'
import type { Session, TenantValue } from '../types'

const maxDepth = 32

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * `value` as JSON with each object's keys sorted and arrays kept in order, written out rather than rebuilt, so an own
 * `__proto__` key is encoded like any other. Throws on what JSON cannot hold and past `maxDepth` levels of nesting.
 */
export const canonicalJson = (value: unknown, depth = 0): string => {
  if (depth > maxDepth) throw new Error(`The call nests deeper than ${maxDepth} levels`)
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('The call holds a number JSON cannot')
    return JSON.stringify(value)
  }
  // `Array.from` visits a hole as `undefined`, which is refused below.
  if (Array.isArray(value)) return `[${Array.from(value, (item) => canonicalJson(item, depth + 1)).join(',')}]`
  if (typeof value === 'object' && isPlainObject(value)) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, depth + 1)}`).join(',')}}`
  }
  throw new Error('The call holds a value JSON cannot')
}

/** Everything besides the arguments that decides where a write lands and who makes it. */
export type CallScope = {
  /** The MCP resource the token was verified for, the app the call is served for. */
  resource: string
  user: string | number
  tenant: TenantValue | null
  organization: TenantValue | null
  client: string | null
}

const isUserId = (id: unknown): id is string | number => (typeof id === 'string' && id !== '') || (typeof id === 'number' && Number.isFinite(id))

/** The scope of a call by `session` to `resource`; throws for a session without a user to bind an approval to. */
export const callScope = (session: Session, resource: URL | undefined): CallScope => {
  if (session.anonymous || !isUserId(session.user.id)) throw new Error('An approval needs a signed-in user')
  if (!resource) throw new Error('An approval needs the MCP resource the token was verified for')
  return { resource: resource.href, user: session.user.id, tenant: session.tenant ?? null, organization: session.organization?.id ?? null, client: session.client?.id ?? null }
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** The SHA-256 of a tool call: its tool, its arguments and its scope. */
export const callHash = (tool: string, args: unknown, scope: CallScope) => sha256(canonicalJson(['mcp.approve.call.v1', tool, args, scope]))

/** The SHA-256 of `scope` alone, which the approvals waiting for an answer are kept under. */
export const scopeHash = (scope: CallScope) => sha256(canonicalJson(['mcp.approve.scope.v1', scope]))
