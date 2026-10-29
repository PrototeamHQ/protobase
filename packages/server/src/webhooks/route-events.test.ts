import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { ResourceChange } from '../changes/resource-change'
import { subscriptionProblems, subscriptionRouter } from './route-events'
import { subscriptionEvent } from './subscriber-view'
import { subscription } from './subscription'

const orders = resource('orders')
  .table('orders')
  .fields({ id: f.integer(), total: f.decimal({ precision: 12, scale: 2 }), organizationId: f.integer(), iban: f.text().optional().sensitive() })
  .primaryKey((r) => r.id)
  .tenant((r) => r.organizationId)
  .events((e) => [...e.crud(), e.becomes('large', 'total > 1000')])
  .toModel()
const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud()).toModel()
const models = [orders, notes]

const change = (extra: Partial<ResourceChange> = {}): ResourceChange => ({
  resource: 'orders',
  key: '7',
  operation: 'create',
  after: { id: 7, total: '1500.00', organizationId: 3 },
  changed: [],
  actor: null,
  source: 'database',
  databaseRole: 'app',
  tenant: 3,
  transaction: '753',
  sequence: '48211',
  at: '2026-10-10T21:04:05.123Z',
  ...extra,
})

const run = () => {}

describe('subscriptionProblems', () => {
  it('accepts names, resource wildcards and everything', () => {
    const subscriptions = [subscription('a', { events: ['orders.large', 'notes.*', '*'], run })]
    expect(subscriptionProblems(subscriptions, models, [])).toEqual([])
  })

  it('names patterns without events, bad filters, missing functions, empty urls and roles', () => {
    const subscriptions = [
      subscription('typo', { events: ['order.created', 'orders.big'], run }),
      subscription('filtered', { events: ['orders.*', 'notes.created'], when: 'total > 5', run }),
      subscription('call', { events: ['orders.created'], function: 'sync' }),
      subscription('slack', { events: ['orders.created'], url: undefined }),
      subscription('off', { events: ['orders.created'], url: undefined, enabled: false }),
      subscription('nobody', { events: ['orders.created'], as: { roles: [] }, run }),
    ]
    expect(subscriptionProblems(subscriptions, models, ['other'])).toEqual([
      'Subscription "typo" "order.created" matches no declared event',
      'Subscription "typo" "orders.big" matches no declared event',
      'Subscription "filtered" when Unknown field "total" on notes',
      'Subscription "call" calls the function "sync", which the app does not have',
      'Subscription "slack" has an empty url; is its environment variable set?',
      'Subscription "nobody" delivers as no roles',
    ])
  })

  it('refuses a definition with no target, two targets or no events', () => {
    expect(() => subscription('none', { events: ['orders.created'] } as never)).toThrow('needs one target: url, function or run')
    expect(() => subscription('two', { events: ['orders.created'], url: 'https://x.test', run } as never)).toThrow('not url and run')
    expect(() => subscription('empty', { events: [], run })).toThrow('names no events')
    expect(() => subscription('bad name', { events: ['*'], run })).toThrow('must start with a letter')
  })
})

describe('subscriptionRouter', () => {
  it('routes each event a subscription names, when it is enabled, of its tenant and passes its filter', () => {
    const route = subscriptionRouter(
      [
        subscription('all', { events: ['orders.*'], run }),
        subscription('large', { events: ['orders.large'], run }),
        subscription('big', { events: ['orders.created'], when: 'total > 2000', run }),
        subscription('other', { events: ['orders.created'], tenant: 4, run }),
        subscription('off', { events: ['orders.created'], enabled: false, run }),
      ],
      models,
    )
    const routes = route(change(), ['orders.created', 'orders.large'])
    expect(routes.map(({ subscription, event }) => `${subscription.name} ${event}`)).toEqual(['all orders.created', 'all orders.large', 'large orders.large'])
    expect(route(change({ after: { id: 7, total: '2500.00', organizationId: 4 }, tenant: 4 }), ['orders.created']).map(({ subscription }) => subscription.name)).toEqual(['all', 'big', 'other'])
  })

  it('holds a tenant only to resources that declare one', () => {
    const route = subscriptionRouter([subscription('mine', { events: ['orders.created', 'notes.created'], tenant: 1, run })], models)
    const names = (extra: Partial<ResourceChange>) => route(change(extra), [`${extra.resource ?? 'orders'}.created`]).map(({ subscription }) => subscription.name)
    expect(names({ resource: 'notes', after: { id: 2, body: 'hi' }, tenant: undefined })).toEqual(['mine'])
    expect(names({ tenant: 2 })).toEqual([])
    expect(names({ tenant: undefined })).toEqual([])
    expect(names({ tenant: null as never })).toEqual([])
    expect(names({ resource: 'unknown', tenant: undefined })).toEqual([])
    expect(names({ tenant: 1 })).toEqual(['mine'])
  })

  it('checks a delete against the record before it', () => {
    const route = subscriptionRouter([subscription('big', { events: ['orders.deleted'], when: 'total > 2000', run })], models)
    expect(route(change({ operation: 'delete', after: undefined, before: { id: 7, total: '2500.00' } }), ['orders.deleted'])).toHaveLength(1)
  })
})

describe('subscriptionEvent', () => {
  it('is the change as a receiver gets it, with an id that every retry shares', () => {
    expect(subscriptionEvent(change({ before: { id: 7, total: '900.00', organizationId: 3 }, operation: 'update', changed: ['total', 'iban'] }), 'orders.large')).toEqual({
      id: 'evt_48211_large',
      type: 'orders.large',
      timestamp: '2026-10-10T21:04:05.123Z',
      data: {
        resource: 'orders',
        operation: 'update',
        key: '7',
        sequence: '48211',
        after: { id: 7, total: '1500.00', organizationId: 3 },
        before: { id: 7, total: '900.00', organizationId: 3 },
        changed: ['total', 'iban'],
        tenant: 3,
        actor: null,
        source: 'database',
        transaction: '753',
      },
    })
  })

  it('keeps only the fields a subscriber may read, and no records when thin', () => {
    const event = subscriptionEvent(change({ changed: ['total', 'iban'] }), 'orders.created', { fields: ['id', 'organizationId'] })
    expect([event.data.after, event.data.changed]).toEqual([{ id: 7, organizationId: 3 }, []])
    expect(subscriptionEvent(change(), 'orders.created', { thin: true }).data).not.toHaveProperty('after')
  })
})
