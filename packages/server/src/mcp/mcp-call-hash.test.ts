import { describe, expect, it } from 'vitest'
import type { Session } from '../types'
import { callHash, callScope, canonicalJson, scopeHash } from './mcp-call-hash'

const resource = new URL('https://app.example/api/mcp')
const session: Session = { user: { id: 1, roles: ['sales'] }, client: { id: 'client', scopes: ['mcp'] } }
const scope = callScope(session, resource)

describe('canonicalJson', () => {
  it('sorts keys and keeps arrays in order', () => {
    expect(canonicalJson({ b: 1, a: [2, 1] })).toBe('{"a":[2,1],"b":1}')
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
  })

  it('encodes an own __proto__ or constructor key like any other', () => {
    expect(canonicalJson(JSON.parse('{"__proto__":{"x":1},"a":1}'))).toBe('{"__proto__":{"x":1},"a":1}')
    expect(canonicalJson(JSON.parse('{"constructor":1}'))).toBe('{"constructor":1}')
  })

  it('refuses what JSON cannot hold', () => {
    for (const value of [undefined, () => 1, 1n, Number.NaN, Infinity, new Date(0), new Map(), [1, , 3], { a: undefined }]) {
      expect(() => canonicalJson(value)).toThrow()
    }
  })

  it('refuses nesting past 32 levels', () => {
    const nested = (depth: number): unknown => (depth === 0 ? 1 : [nested(depth - 1)])
    expect(() => canonicalJson(nested(32))).not.toThrow()
    expect(() => canonicalJson(nested(33))).toThrow('deeper than 32')
  })
})

describe('callHash', () => {
  const hash = (args: unknown, tool = 'create_record', on = scope) => callHash(tool, args, on)

  it('is a full SHA-256, the same for the same call however its keys are ordered', () => {
    expect(hash({ resource: 'tasks', data: { a: 1, b: 2 } })).toMatch(/^[0-9a-f]{64}$/)
    expect(hash({ resource: 'tasks', data: { a: 1, b: 2 } })).toBe(hash({ data: { b: 2, a: 1 }, resource: 'tasks' }))
  })

  it('differs for anything that runs differently', () => {
    const base = hash({ operations: [{ op: 'create' }, { op: 'delete' }], data: { a: 1 } })
    for (const other of [
      hash({ operations: [{ op: 'delete' }, { op: 'create' }], data: { a: 1 } }),
      hash({ operations: [{ op: 'create' }, { op: 'delete' }], data: { a: 1, b: null } }),
      hash({ operations: [{ op: 'create' }, { op: 'delete' }], data: { a: '1' } }),
      hash(JSON.parse('{"operations":[{"op":"create"},{"op":"delete"}],"data":{"a":1,"__proto__":{"a":2}}}')),
      hash({ operations: [{ op: 'create' }, { op: 'delete' }], data: { a: 1 } }, 'update_record'),
    ]) expect(other).not.toBe(base)
  })

  it('differs for each part of the scope', () => {
    const args = { resource: 'tasks', data: { a: 1 } }
    const base = hash(args)
    for (const other of [
      callScope({ ...session, user: { id: 2, roles: ['sales'] } }, resource),
      callScope({ ...session, user: { id: '1', roles: ['sales'] } }, resource),
      callScope({ ...session, tenant: 7 }, resource),
      callScope({ ...session, organization: { id: 7 } }, resource),
      callScope({ ...session, client: { id: 'other', scopes: ['mcp'] } }, resource),
      callScope(session, new URL('https://other.example/api/mcp')),
    ]) {
      expect(hash(args, 'create_record', other)).not.toBe(base)
      expect(scopeHash(other)).not.toBe(scopeHash(scope))
    }
  })
})

describe('callScope', () => {
  it('refuses a session without a user to bind an approval to, or no resource', () => {
    for (const id of ['', null, undefined, Number.NaN, {}]) {
      expect(() => callScope({ user: { id, roles: [] } } as unknown as Session, resource)).toThrow('signed-in user')
    }
    expect(() => callScope({ ...session, anonymous: true }, resource)).toThrow('signed-in user')
    expect(() => callScope(session, undefined)).toThrow('MCP resource')
  })
})
