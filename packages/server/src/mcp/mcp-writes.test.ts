import { describe, expect, it } from 'vitest'
import type { Registry } from '../registry'
import { checkMcpWrites, isMcpWrites } from './mcp-writes'

const registry = { find: (name: string) => (name === 'tasks' ? {} : undefined) } as unknown as Registry

describe('isMcpWrites', () => {
  it('takes a boolean or a non-empty list of resource names', () => {
    expect([true, false, { resources: ['tasks'] }].every(isMcpWrites)).toBe(true)
    expect([undefined, 'true', [], { resources: [] }, { resources: 'tasks' }, { resources: [''] }, { resources: ['tasks'], creates: true }].some(isMcpWrites)).toBe(false)
  })
})

describe('checkMcpWrites', () => {
  it('stops startup on a resource the app does not have', () => {
    expect(() => checkMcpWrites(registry, { resources: ['tasks', 'notes', 'people'] })).toThrow('options.mcp.writes names resources the app does not have: notes, people')
    expect(() => checkMcpWrites(registry, { resources: ['tasks'] })).not.toThrow()
    expect(() => checkMcpWrites(registry, true)).not.toThrow()
    expect(() => checkMcpWrites(registry, undefined)).not.toThrow()
  })
})
