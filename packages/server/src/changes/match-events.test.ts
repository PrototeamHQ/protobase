import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { CoalescedChange } from './coalesce'
import { EventCodeError } from './event-code-error'
import { eventMatcher } from './match-events'
import { currentChange, resourceChange } from './resource-change'

const orders = resource('orders')
  .table('sales.orders')
  .fields({
    id: f.bigint().readOnly(),
    status: f.enum(['open', 'paid', 'cancelled']),
    total: f.decimal({ precision: 12, scale: 2 }),
    notes: f.text().optional(),
    organizationId: f.integer(),
    deletedAt: f.timestamp().optional(),
    iban: f.text().optional().sensitive(),
  })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .softDelete((r) => r.deletedAt)
  .events((e, r) => [
    ...e.crud(),
    e.becomes('large', 'total > 1000'),
    e.updated('statusChanged', { changed: [r.status] }),
    e.updated('ibanChanged', { changed: [r.iban] }),
    e.updated('reopened', { from: 'status = "cancelled"', when: 'status != "cancelled"' }),
    e.created('rush', { match: ({ after }) => String(after?.notes ?? '').includes('RUSH') }),
  ])

const model = orders.toModel()
const match = eventMatcher(model, orders.eventMatches())

const columns = (values: Record<string, unknown>) => ({ id: 7, status: 'open', total: 10, notes: null, organization_id: 3, deleted_at: null, ...values })

const change = (before: Record<string, unknown> | null, after: Record<string, unknown> | null, changed: string[] = []): CoalescedChange => ({
  transaction: '753',
  resource: 'orders',
  before: before && columns(before),
  after: after && columns(after),
  changed,
  actor: { id: 'u_12', roles: ['sales'] },
  databaseRole: 'app',
  sequence: '48211',
  at: '2026-10-10T21:04:05.123Z',
})

const events = (coalesced: CoalescedChange) => match(resourceChange(model, coalesced))

describe('resourceChange', () => {
  it('maps columns to fields as the API shows them, with key, tenant and source', () => {
    expect(resourceChange(model, change({ total: 10 }, { total: 1200.5 }, ['total']))).toEqual({
      resource: 'orders',
      key: '7',
      operation: 'update',
      before: { id: '7', status: 'open', total: '10', notes: null, organizationId: 3, deletedAt: null },
      after: { id: '7', status: 'open', total: '1200.5', notes: null, organizationId: 3, deletedAt: null },
      changed: ['total'],
      actor: { id: 'u_12', roles: ['sales'] },
      source: 'api',
      databaseRole: 'app',
      tenant: 3,
      transaction: '753',
      sequence: '48211',
      at: '2026-10-10T21:04:05.123Z',
    })
    expect(resourceChange(model, { ...change(null, {}), actor: null }).source).toBe('database')
  })

  it('tells soft deletes and undeletes from updates', () => {
    const at = '2026-10-10T21:04:05.123+00:00'
    expect(resourceChange(model, change({}, { deleted_at: at }, ['deleted_at'])).operation).toBe('delete')
    expect(resourceChange(model, change({ deleted_at: at }, {}, ['deleted_at'])).operation).toBe('undelete')
    expect(resourceChange(model, change({}, null)).operation).toBe('delete')
    expect(resourceChange(model, change(null, {})).operation).toBe('create')
  })

  it('leaves out a sensitive field a row was captured with, and still names it as changed', () => {
    const iban = 'NL91ABNA0417164300'
    expect(resourceChange(model, change(null, { iban })).after).toEqual({ id: '7', status: 'open', total: '10', notes: null, organizationId: 3, deletedAt: null })
    const updated = resourceChange(model, change({ iban: 'old' }, { iban }, ['iban']))
    expect(JSON.stringify(updated)).not.toContain(iban)
    expect(updated.before).not.toHaveProperty('iban')
    expect(updated.changed).toEqual(['iban'])
  })
})

describe('currentChange', () => {
  const kept = { ...resourceChange(model, change({}, {}, ['iban'])) }

  it('drops fields that are sensitive now or gone from a change kept before', () => {
    const stale = { ...kept, before: { ...kept.before, iban: 'old', gone: 1 }, after: { ...kept.after, iban: 'new', gone: 2 } }
    expect(currentChange(model, stale)).toEqual(kept)
  })

  it('drops a property an earlier release kept', () => {
    const stale = { ...kept, record: { iban: 'old' } }
    expect(currentChange(model, stale)).toEqual(kept)
  })
})

describe('eventMatcher', () => {
  it('raises the crud events by operation', () => {
    expect(events(change(null, {}))).toEqual(['orders.created'])
    expect(events(change({ notes: 'a' }, { notes: 'b' }, ['notes']))).toEqual(['orders.updated'])
    expect(events(change({}, null))).toEqual(['orders.deleted'])
    expect(events(change({ deleted_at: '2026-10-10' }, {}, ['deleted_at']))).toEqual(['orders.undeleted'])
  })

  it('fires becomes when the condition turns true, on a create or an update', () => {
    expect(events(change(null, { total: 1500 }))).toEqual(['orders.created', 'orders.large'])
    expect(events(change({ total: 900 }, { total: 1100 }, ['total']))).toEqual(['orders.updated', 'orders.large'])
    expect(events(change({ total: 1100 }, { total: 1200 }, ['total']))).toEqual(['orders.updated'])
  })

  it('needs one of the changed fields to change, sensitive ones too', () => {
    expect(events(change({ status: 'open' }, { status: 'paid' }, ['status']))).toEqual(['orders.updated', 'orders.statusChanged'])
    expect(events(change({}, {}, ['iban']))).toEqual(['orders.updated', 'orders.ibanChanged'])
  })

  it('checks from on the record before and when on the record after', () => {
    expect(events(change({ status: 'cancelled' }, { status: 'open' }, ['status']))).toEqual(['orders.updated', 'orders.statusChanged', 'orders.reopened'])
    expect(events(change({ status: 'paid' }, { status: 'open' }, ['status']))).toEqual(['orders.updated', 'orders.statusChanged'])
  })

  it('asks the code predicate with the change as the event sees it', () => {
    expect(events(change(null, { notes: 'RUSH please' }))).toEqual(['orders.created', 'orders.rush'])
  })

  it('names the event and the record when the code predicate throws', () => {
    const throwing = eventMatcher(model, { 'orders.rush': ({ after }) => (after!.notes as string).includes('RUSH') })
    const raise = () => throwing(resourceChange(model, change(null, {})))
    expect(raise).toThrow(EventCodeError)
    expect(raise).toThrow(/^Event orders\.rush on orders 7 threw: /)
  })

  it('raises nothing for a resource without events', () => {
    const plain = resource('notes').table('notes').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
    expect(eventMatcher(plain)(resourceChange(plain, { ...change(null, {}), resource: 'notes' }))).toEqual([])
  })
})
