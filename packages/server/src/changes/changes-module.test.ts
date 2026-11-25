import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { f, resource, type ResourceModel } from '@protobase/schema'
import { latestModel, moduleDifference, retiredDifference } from '../schema-modules/module-difference'
import { neededModules } from '../schema-modules/needed-modules'
import { schemaModules, targetIds } from '../schema-modules/modules'
import type { ModuleModel } from '../schema-modules/schema-module'
import { resourceTriggers } from './capture-sql'
import { changesModule } from './changes-module'

const orders = resource('orders').table('sales.orders').fields({ id: f.integer(), status: f.text(), iban: f.text().optional().sensitive() }).primaryKey((r) => r.id)
const refunds = resource('refunds').table('refunds').fields({ id: f.integer(), total: f.integer() }).primaryKey((r) => r.id)
const targets = (models: ResourceModel[]) => neededModules({ models, views: [], jobs: [], signIn: false })
const input = (models: ResourceModel[]) => targets(models).changes!

// The statements of a migration, without comments, each once: `capture()`'s body is kept whole.
const statements = (text: string) => {
  const bodies: string[] = []
  const masked = text.replace(/\$capture\$[\s\S]*?\$capture\$/g, (body) => `$body${bodies.push(body) - 1}$`)
  const split = masked.split(/;\s*(?:\n|$)/).map((statement) => statement.split('\n').filter((line) => !line.startsWith('--')).join('\n').trim())
  return new Set(split.filter(Boolean).map((statement) => statement.replace(/\$body(\d+)\$/g, (_, index: string) => bodies[Number(index)]!)))
}

describe('the change capture module', () => {
  // `written-before-steps.sql` is what the migration of the change capture wrote on an empty database before it was a
  // module, for orders with events, history and live updates. The `alter` there brought an outbox of a version before
  // it up to date, which no step records: on an empty database it changes nothing.
  it('writes on an empty database the statements the change capture wrote before it had steps', () => {
    const before = readFileSync(new URL('./steps/written-before-steps.sql', import.meta.url), 'utf8')
    const all = targets([orders.events((e) => e.crud()).history().live().toModel()])
    const now = targetIds(all).filter((id) => id !== 'jobs').map((id) => moduleDifference(schemaModules[id], all[id]!, undefined).sql!).join('\n\n')
    const upgrade = 'alter table "changes"."outbox" add column if not exists "database_role" text'
    expect(statements(now)).toEqual(new Set([...statements(before)].filter((statement) => statement !== upgrade)))
  })

  it("names its schema from events, and holds each captured resource's triggers at a digest of their statements", () => {
    const model = latestModel(changesModule, neededModules({ models: [orders.events((e) => e.crud()).toModel()], views: [], jobs: [], signIn: false, events: { schema: 'events' } }).changes)
    expect(model).toEqual({ lastStep: 1, replaceables: { capture: 1 }, names: { schema: 'events' }, resources: { triggers: { orders: { version: 1, digest: expect.stringMatching(/^[0-9a-f]{16}$/), table: { schema: 'sales', name: 'orders' } } } } })
  })

  it('writes the triggers of a resource added, and again once its fields change', () => {
    const first = moduleDifference(changesModule, input([orders.events((e) => e.crud()).toModel()]), undefined)
    const added = moduleDifference(changesModule, input([orders.events((e) => e.crud()).toModel(), refunds.events((e) => e.crud()).toModel()]), first.model)
    expect(added.sql).toBe(
      `-- The triggers that capture the changes of refunds.\ndrop trigger if exists "refunds_changes" on "refunds";\ncreate trigger "refunds_changes" after insert or delete on "refunds" for each row execute function "changes"."capture"('refunds', '{"id","total"}', '{}');\ndrop trigger if exists "refunds_changes_update" on "refunds";\ncreate trigger "refunds_changes_update" after update on "refunds" for each row when (old.* is distinct from new.*) execute function "changes"."capture"('refunds', '{"id","total"}', '{}');`,
    )
    expect(added.breaks).toEqual([])
    const changed = orders.fields({ id: f.integer(), status: f.text(), iban: f.text().optional() }).events((e) => e.crud())
    expect(moduleDifference(changesModule, input([changed.toModel(), refunds.events((e) => e.crud()).toModel()]), added.model).sql).toMatch(/^-- The triggers that capture the changes of orders\.\n/)
  })

  it('keeps the triggers of a resource dropped while another is captured, following its fields while it is in the config', () => {
    const both = moduleDifference(changesModule, input([orders.events((e) => e.crud()).toModel(), refunds.events((e) => e.crud()).toModel()]), undefined).model
    const dropped = moduleDifference(changesModule, input([orders.toModel(), refunds.events((e) => e.crud()).toModel()]), both)
    expect(dropped.sql).toBeUndefined()
    expect(dropped.model).toEqual(both)
    const gone = moduleDifference(changesModule, input([refunds.events((e) => e.crud()).toModel()]), both)
    expect(gone.sql).toBeUndefined()
    expect(gone.model.resources!.triggers!.orders).toEqual(both.resources!.triggers!.orders)
    const sensitive = orders.fields({ id: f.integer(), status: f.text().sensitive(), iban: f.text().optional().sensitive() })
    expect(moduleDifference(changesModule, input([sensitive.toModel(), refunds.events((e) => e.crud()).toModel()]), both).sql).toMatch(/^-- The triggers that capture the changes of orders\.\n/)
  })

  it("drops every resource's triggers once none is captured, breaking older code, and keeps its tables and capture()", () => {
    const both = moduleDifference(changesModule, input([orders.events((e) => e.crud()).toModel(), refunds.events((e) => e.crud()).toModel()]), undefined).model
    expect(targets([orders.toModel(), refunds.toModel()]).changes).toBeUndefined()
    const retired = retiredDifference(changesModule, both)
    expect(retired.sql).toBe(
      '-- The triggers that capture the changes of orders, which no resource needs any more.\ndrop trigger if exists "orders_changes" on "sales"."orders";\ndrop trigger if exists "orders_changes_update" on "sales"."orders";\n\n-- The triggers that capture the changes of refunds, which no resource needs any more.\ndrop trigger if exists "refunds_changes" on "refunds";\ndrop trigger if exists "refunds_changes_update" on "refunds";',
    )
    expect(retired.breaks).toEqual(['it drops its triggers of orders, which the code before still runs with', 'it drops its triggers of refunds, which the code before still runs with'])
    expect(retired.model).toEqual({ lastStep: 1, replaceables: { capture: 1 }, names: { schema: 'changes' } })
    expect(retiredDifference(changesModule, retired.model).sql).toBeUndefined()
  })

  it('drops the triggers on the table a resource had before it moved to another', () => {
    const before: ModuleModel = moduleDifference(changesModule, input([orders.events((e) => e.crud()).toModel()]), undefined).model
    const moved = resource('orders').table('orders').fields({ id: f.integer(), status: f.text(), iban: f.text().optional().sensitive() }).primaryKey((r) => r.id).events((e) => e.crud())
    const difference = moduleDifference(changesModule, input([moved.toModel()]), before)
    expect(difference.sql).toMatch(/^-- The triggers that capture the changes of orders on the table it had\.\ndrop trigger if exists "orders_changes" on "sales"\."orders";\ndrop trigger if exists "orders_changes_update" on "sales"\."orders";\n\n-- The triggers that capture the changes of orders\.\ndrop trigger if exists "orders_changes" on "orders";/)
    expect(difference.breaks).toEqual(['it drops its triggers of orders on the table it had, which the code before still runs with'])
  })

  it('drops the triggers of a resource that moved off a table before another takes that table', () => {
    const tickets = resource('tickets').table('tickets').fields({ id: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud())
    const before = moduleDifference(changesModule, input([tickets.toModel()]), undefined).model
    const swapped = [resource('tickets').table('archived_tickets').fields({ id: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud()), resource('fresh').table('tickets').fields({ id: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud())]
    const sql = moduleDifference(changesModule, input(swapped.map((model) => model.toModel())), before).sql!
    expect(sql.indexOf('drop trigger if exists "tickets_changes" on "tickets";')).toBeLessThan(sql.indexOf('create trigger "tickets_changes"'))
  })

  it('gives the two triggers of a table with a long name names of their own within 63 bytes, and drops the cut name an earlier version gave them', () => {
    const long = resource('long').table('a'.repeat(60)).fields({ id: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud())
    const [insertDelete, update] = resourceTriggers(long.toModel())
    expect([insertDelete!.name, update!.name]).toEqual([`${'a'.repeat(55)}_changes`, `${'a'.repeat(48)}_changes_update`])
    const sql = moduleDifference(changesModule, input([long.toModel()]), undefined).sql!
    expect(sql).toContain(`drop trigger if exists "${'a'.repeat(60)}_ch" on "${'a'.repeat(60)}";`)
  })

  it('refuses a changes schema renamed since the snapshot', () => {
    const before = moduleDifference(changesModule, input([orders.events((e) => e.crud()).toModel()]), undefined).model
    const renamed = neededModules({ models: [orders.events((e) => e.crud()).toModel()], views: [], jobs: [], signIn: false, events: { schema: 'events' } }).changes!
    expect(() => moduleDifference(changesModule, renamed, before)).toThrow(`Not implemented: renaming what a migration made: the change capture's schema is "changes" in the snapshot and "events" now. Name it as before in the config`)
  })
})
