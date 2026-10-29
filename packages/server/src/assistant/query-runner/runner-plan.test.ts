import { describe, expect, it } from 'vitest'
import { plannedGrants } from './runner-plan'

const notes = { schema: 'public', name: 'notes' }
const orders = { schema: 'sales', name: 'orders' }
const session = { schema: 'auth', name: 'session' }
const none = { tables: [], schemas: [] }

describe('plannedGrants', () => {
  it('grants usage on the schemas of the resources and select on their tables', () => {
    expect(plannedGrants({ resources: [notes, orders], authTables: [], guardedSchemas: [], granted: none })).toEqual({
      grants: [
        { on: 'schema', schema: 'public' },
        { on: 'schema', schema: 'sales' },
        { on: 'table', schema: 'public', name: 'notes' },
        { on: 'table', schema: 'sales', name: 'orders' },
      ],
      revokes: [],
    })
  })

  it('never grants an auth table, nor its schema, even when a resource is one', () => {
    const user = { schema: 'public', name: 'user' }
    expect(plannedGrants({ resources: [session, user, notes], authTables: [session, user], guardedSchemas: [], granted: none })).toEqual({
      grants: [
        { on: 'schema', schema: 'public' },
        { on: 'table', schema: 'public', name: 'notes' },
      ],
      revokes: [],
    })
  })

  it('grants a table two resources share once', () => {
    expect(plannedGrants({ resources: [notes, notes], authTables: [], guardedSchemas: [], granted: none }).grants).toEqual([
      { on: 'schema', schema: 'public' },
      { on: 'table', schema: 'public', name: 'notes' },
    ])
  })

  it('has nothing to do once the role holds exactly that', () => {
    expect(plannedGrants({ resources: [notes], authTables: [session], guardedSchemas: [], granted: { tables: [notes], schemas: ['public'] } })).toEqual({ grants: [], revokes: [] })
  })

  it('takes back the tables and schemas no resource needs any more, an auth table among them', () => {
    expect(plannedGrants({ resources: [notes], authTables: [session], guardedSchemas: [], granted: { tables: [notes, orders, session], schemas: ['public', 'sales', 'auth'] } })).toEqual({
      grants: [],
      revokes: [
        { on: 'table', schema: 'sales', name: 'orders' },
        { on: 'table', schema: 'auth', name: 'session' },
        { on: 'schema', schema: 'sales' },
        { on: 'schema', schema: 'auth' },
      ],
    })
  })

  it('never grants a table of a guarded schema, whatever its name, and takes back what the role held there', () => {
    const identities = { schema: 'auth', name: 'identities' }
    const later = { schema: 'auth', name: 'not_yet_known' }
    expect(plannedGrants({ resources: [identities, later, notes], authTables: [], guardedSchemas: ['auth'], granted: { tables: [identities], schemas: ['auth'] } })).toEqual({
      grants: [
        { on: 'schema', schema: 'public' },
        { on: 'table', schema: 'public', name: 'notes' },
      ],
      revokes: [
        { on: 'table', schema: 'auth', name: 'identities' },
        { on: 'schema', schema: 'auth' },
      ],
    })
  })
})
