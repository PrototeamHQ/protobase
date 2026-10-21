import { describe, expect, it } from 'vitest'
import { defineRoles } from '@protobase/schema'
import type { Session } from '../types'
import { functionGate } from './function-gate'

const roles = defineRoles<'vms' | 'console'>({
  admin: ['*'],
  operator: ['vms.*', 'console.read'],
  read_only: ['*.read'],
  owner: ['vms.update.own'],
})
const session = (...roles: string[]): Session => ({ user: { id: 1, roles } })
const callers = ['admin', 'operator', 'read_only', 'owner'] as const
const allowed = (gate: ReturnType<typeof functionGate>) => callers.filter((role) => gate(session(role)))

describe('functionGate', () => {
  it('lets only callers holding * call a function without roles or a capability, once the app defines roles', () => {
    expect(allowed(functionGate('start', {}, { roles }))).toEqual(['admin'])
    expect(allowed(functionGate('start', {}, { roles, defaultAccess: 'deny' }))).toEqual(['admin'])
  })

  it('lets every signed-in caller in without the app’s roles, or with defaultAccess allow', () => {
    expect(allowed(functionGate('start', {}, {}))).toEqual(callers)
    expect(allowed(functionGate('start', {}, { roles, defaultAccess: 'allow' }))).toEqual(callers)
  })

  it('lets in callers whose roles hold all of the capability, in every row', () => {
    expect(allowed(functionGate('start', { capability: 'vms.update' }, { roles }))).toEqual(['admin', 'operator'])
    expect(allowed(functionGate('console', { capability: 'console.*' }, { roles }))).toEqual(['admin'])
    expect(allowed(functionGate('report', { capability: '*.read' }, { roles }))).toEqual(['admin', 'read_only'])
  })

  it('lets in callers with one of the roles, and anyone for a public function', () => {
    expect(allowed(functionGate('start', { roles: ['operator', 'owner'] }, { roles }))).toEqual(['operator', 'owner'])
    expect(allowed(functionGate('hook', { public: true }, { roles }))).toEqual(callers)
  })

  it('refuses at startup a capability it cannot check', () => {
    expect(() => functionGate('start', { capability: 'vms.update' }, {})).toThrow('needs the capability "vms.update", but the app defines no roles')
    expect(() => functionGate('start', { roles: ['admin'], capability: 'vms.update' }, { roles })).toThrow('both roles and a capability')
    expect(() => functionGate('start', { capability: 'vms.start' as never }, { roles })).toThrow('Invalid capability "vms.start"')
    expect(() => functionGate('start', {}, { roles: { can: roles.can } })).toThrow('have no holds(user, capability)')
  })
})
