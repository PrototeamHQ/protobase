import { anonymousRole } from '@protobase/schema'
import type { Registry } from '../registry'

/**
 * Which resources the MCP write tools may change: none, every one the caller may write, or the ones named; and the
 * roles whose writes run without the person's approval in the client.
 */
export type McpWrites = boolean | { resources?: string[]; rolesWithoutApproval?: string[] }

const isNameList = (value: unknown) => Array.isArray(value) && value.every((name) => typeof name === 'string' && name !== '')

const isWritesEntry = ([name, value]: [string, unknown]) =>
  (name === 'resources' && isNameList(value) && (value as unknown[]).length > 0) || (name === 'rolesWithoutApproval' && isNameList(value))

export const isMcpWrites = (value: unknown): value is McpWrites => {
  if (typeof value === 'boolean') return true
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length > 0 && entries.every(isWritesEntry)
}

/** The roles `writes` lets write without approval; none unless named. */
export const rolesWithoutApproval = (writes: McpWrites | undefined): readonly string[] => (typeof writes === 'object' ? (writes.rolesWithoutApproval ?? []) : [])

/**
 * Stops startup when `options.mcp.writes` names a resource the app does not have, or lets a role write without
 * approval that is not one of `roles`, the roles its users can hold, or is the anonymous role.
 */
export const checkMcpWrites = (registry: Registry, roles: readonly string[] | undefined, writes: McpWrites | undefined) => {
  if (typeof writes !== 'object') return
  const unknown = (writes.resources ?? []).filter((name) => !registry.find(name))
  if (unknown.length > 0) throw new Error(`options.mcp.writes names resources the app does not have: ${unknown.join(', ')}`)
  const unheld = rolesWithoutApproval(writes).filter((role) => role === anonymousRole || !(roles ?? []).includes(role))
  if (unheld.length > 0) throw new Error(`options.mcp.writes.rolesWithoutApproval names roles the app's users cannot hold: ${unheld.join(', ')}`)
}
