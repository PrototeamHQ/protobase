import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { capturePlan, planSql, uncaptured, type CaptureState } from './capture-plan'
import { captureBody, createTriggerSql, resourceTriggers } from './capture-sql'

const orders = resource('orders')
  .table('sales.orders')
  .fields({ id: f.integer(), status: f.text(), iban: f.text().optional().sensitive() })
  .primaryKey((r) => r.id)
const withEvents = orders.events((e) => e.crud()).toModel()
const plain = orders.toModel()

const capture = { oid: '900', source: captureBody('changes'), definer: true }
const installed = (extra: Partial<CaptureState> = {}): CaptureState => ({
  outbox: true,
  history: false,
  notices: false,
  capture,
  triggers: resourceTriggers(withEvents).map((trigger) => ({ ...trigger, table: '500', tableSql: '"sales"."orders"', function: '900' })),
  tables: { orders: '500' },
  ...extra,
})

describe('resourceTriggers', () => {
  it('passes the resource, the columns to keep and the sensitive ones', () => {
    expect(resourceTriggers(withEvents)).toEqual([
      { name: 'orders_changes', type: 13, args: ['orders', '{"id","status"}', '{"iban"}'] },
      { name: 'orders_changes_update', type: 17, args: ['orders', '{"id","status"}', '{"iban"}'] },
    ])
    expect(createTriggerSql('changes', resourceTriggers(withEvents)[1]!, '"sales"."orders"')).toBe(
      `create trigger "orders_changes_update" after update on "sales"."orders" for each row when (old.* is distinct from new.*) execute function "changes"."capture"('orders', '{"id","status"}', '{"iban"}')`,
    )
  })

  it('keeps trigger names within the 63 bytes Postgres keeps', () => {
    const long = resource('long').table('t'.repeat(60)).fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()
    expect(resourceTriggers(long).map((trigger) => trigger.name.length)).toEqual([63, 63])
  })
})

describe('capturePlan', () => {
  it('sets up the schema and both triggers in an empty database', () => {
    const plan = capturePlan('changes', [withEvents], { outbox: false, history: false, notices: false, triggers: [], tables: { orders: '500' } })
    expect(plan.setup).toBe(true)
    expect(plan.create.map(({ trigger }) => trigger.name)).toEqual(['orders_changes', 'orders_changes_update'])
    const text = planSql('changes', plan)!
    expect(text.split(';\n\n').map((statement) => statement.split(/[\s(]/).slice(0, 3).join(' '))).toEqual([
      'create schema if',
      'create table if',
      'create or replace',
      'drop trigger if',
      'create trigger "orders_changes"',
      'drop trigger if',
      'create trigger "orders_changes_update"',
    ])
    expect(uncaptured(plan, [withEvents, plain])).toEqual(['orders'])
  })

  it('has nothing to do when the database is current, or without events and triggers', () => {
    expect(planSql('changes', capturePlan('changes', [withEvents], installed()))).toBeUndefined()
    expect(planSql('changes', capturePlan('changes', [plain], { outbox: false, history: false, notices: false, triggers: [], tables: {} }))).toBeUndefined()
  })

  it('replaces an out-of-date function, and recreates a trigger whose columns changed', () => {
    const stale = capturePlan('changes', [withEvents], installed({ capture: { ...capture, source: 'old body' } }))
    expect([stale.setup, stale.create]).toEqual([true, []])
    const triggers = installed().triggers.map((trigger) => ({ ...trigger, args: ['orders', '{"id","status","iban"}', '{}'] }))
    const changed = capturePlan('changes', [withEvents], installed({ triggers }))
    expect([changed.setup, changed.create.length]).toEqual([false, 2])
    expect(uncaptured(changed, [withEvents])).toEqual(['orders'])
  })

  it('drops the triggers of a resource without events, and never refuses for them', () => {
    const plan = capturePlan('changes', [plain], installed())
    expect(plan).toEqual({ setup: false, history: false, notices: false, create: [], drop: [{ name: 'orders_changes', tableSql: '"sales"."orders"' }, { name: 'orders_changes_update', tableSql: '"sales"."orders"' }] })
    expect(planSql('changes', plan)).toBe('drop trigger if exists "orders_changes" on "sales"."orders";\n\ndrop trigger if exists "orders_changes_update" on "sales"."orders";')
    expect(uncaptured(plan, [plain])).toEqual([])
  })

  it('refuses a missing table, a trigger name of the table own, and two resources with events on one table', () => {
    expect(() => capturePlan('changes', [withEvents], installed({ tables: { orders: null } }))).toThrow('The table "sales"."orders" of resource "orders" does not exist')
    const own = installed().triggers.map((trigger) => ({ ...trigger, function: '77' }))
    expect(() => capturePlan('changes', [withEvents], installed({ triggers: own }))).toThrow('has a trigger "orders_changes" of its own')
    const twin = { ...withEvents, name: 'twin' }
    expect(() => capturePlan('changes', [withEvents, twin], installed({ tables: { orders: '500', twin: '500' } }))).toThrow('both have events or history on table')
  })

  it('captures a resource with history and no events, and adds the history table once', () => {
    const withHistory = orders.history().toModel()
    const plan = capturePlan('changes', [withHistory], { outbox: false, history: false, notices: false, triggers: [], tables: { orders: '500' } })
    expect([plan.setup, plan.history, plan.create.length]).toEqual([true, true, 2])
    expect(planSql('changes', plan)).toContain('create table if not exists "changes"."history"')
    expect(uncaptured(plan, [withHistory])).toEqual(['orders'])
    const missingTable = capturePlan('changes', [withHistory], installed())
    expect([missingTable.setup, missingTable.history, missingTable.create]).toEqual([false, true, []])
    expect(uncaptured(missingTable, [withHistory])).toEqual(['orders'])
    expect(planSql('changes', capturePlan('changes', [withHistory], installed({ history: true })))).toBeUndefined()
    expect(planSql('changes', capturePlan('changes', [withEvents], installed()))).toBeUndefined()
  })

  it('captures a live resource with nothing else, and adds the notices table once', () => {
    const live = orders.live().toModel()
    const plan = capturePlan('changes', [live], { outbox: false, history: false, notices: false, triggers: [], tables: { orders: '500' } })
    expect([plan.setup, plan.history, plan.notices, plan.create.length]).toEqual([true, false, true, 2])
    expect(planSql('changes', plan)).toContain('create table if not exists "changes"."notices"')
    const missingTable = capturePlan('changes', [live], installed())
    expect([missingTable.notices, missingTable.create]).toEqual([true, []])
    expect(uncaptured(missingTable, [live])).toEqual(['orders'])
    expect(planSql('changes', capturePlan('changes', [live], installed({ notices: true })))).toBeUndefined()
  })

  it('adds the database role to the outbox of an earlier version', () => {
    const stale = capturePlan('changes', [withEvents], installed({ capture: { ...capture, source: 'old body' } }))
    expect(planSql('changes', stale)).toContain('alter table "changes"."outbox" add column if not exists "database_role" text')
  })
})
