import { describe, expect, it } from 'vitest'
import type { Registry } from '../registry'
import { checkMcpWrites, isMcpWrites, rolesWithoutApproval } from './mcp-writes'

const roles = ['admin', 'service', 'anonymous']
const registry = { find: (name: string) => (name === 'tasks' ? {} : undefined) } as unknown as Registry

describe('isMcpWrites', () => {
  it('takes a boolean or a non-empty list of resource names', () => {
    expect([true, false, { resources: ['tasks'] }].every(isMcpWrites)).toBe(true)
    expect([undefined, 'true', [], {}, { resources: [] }, { resources: 'tasks' }, { resources: [''] }, { resources: ['tasks'], creates: true }].some(isMcpWrites)).toBe(false)
  })

  it('takes a list of roles that write without approval, empty included', () => {
    expect([{ rolesWithoutApproval: ['service'] }, { rolesWithoutApproval: [] }, { resources: ['tasks'], rolesWithoutApproval: ['service'] }].every(isMcpWrites)).toBe(true)
    expect([{ rolesWithoutApproval: 'service' }, { rolesWithoutApproval: true }, { rolesWithoutApproval: [''] }, { rolesWithoutApproval: [1] }, { rolesWithoutApproval: null }].some(isMcpWrites)).toBe(false)
  })
})

describe('checkMcpWrites', () => {
  it('stops startup on a resource the app does not have', () => {
    expect(() => checkMcpWrites(registry, roles, { resources: ['tasks', 'notes', 'people'] })).toThrow('options.mcp.writes names resources the app does not have: notes, people')
    expect(() => checkMcpWrites(registry, roles, { resources: ['tasks'] })).not.toThrow()
    expect(() => checkMcpWrites(registry, roles, true)).not.toThrow()
    expect(() => checkMcpWrites(registry, roles, undefined)).not.toThrow()
  })

  it('starts with roles the app\'s users can hold, or none', () => {
    expect(() => checkMcpWrites(registry, roles, { resources: ['tasks'], rolesWithoutApproval: ['service', 'admin'] })).not.toThrow()
    expect(() => checkMcpWrites(registry, roles, { rolesWithoutApproval: [] })).not.toThrow()
    expect(() => checkMcpWrites(registry, undefined, { rolesWithoutApproval: [] })).not.toThrow()
  })

  it.each(['*', 'Service', 'service ', '__proto__', 'constructor', 'toString', 'anonymous'])('stops startup on the role %j', (role) => {
    expect(() => checkMcpWrites(registry, roles, { rolesWithoutApproval: ['service', role] })).toThrow(`options.mcp.writes.rolesWithoutApproval names roles the app's users cannot hold: ${role}`)
  })

  it('stops startup on any role when the app declares none', () => {
    expect(() => checkMcpWrites(registry, undefined, { rolesWithoutApproval: ['service'] })).toThrow('cannot hold: service')
  })
})

describe('rolesWithoutApproval', () => {
  it('is the named roles, and none unless named', () => {
    expect(rolesWithoutApproval({ resources: ['tasks'], rolesWithoutApproval: ['service'] })).toEqual(['service'])
    for (const writes of [undefined, true, false, { resources: ['tasks'] }]) expect(rolesWithoutApproval(writes)).toEqual([])
  })
})
