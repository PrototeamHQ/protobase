import type { Registry } from '../registry'

/** Which resources the MCP write tools may change: none, every one the caller may write, or the ones named. */
export type McpWrites = boolean | { resources: string[] }

const isResourceList = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every((name) => typeof name === 'string' && name !== '')

export const isMcpWrites = (value: unknown): value is McpWrites => {
  if (typeof value === 'boolean') return true
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length === 1 && entries[0]![0] === 'resources' && isResourceList(entries[0]![1])
}

/** Stops startup when `options.mcp.writes` names a resource the app does not have. */
export const checkMcpWrites = (registry: Registry, writes: McpWrites | undefined) => {
  if (typeof writes !== 'object') return
  const unknown = writes.resources.filter((name) => !registry.find(name))
  if (unknown.length > 0) throw new Error(`options.mcp.writes names resources the app does not have: ${unknown.join(', ')}`)
}
