import { describe, expect, it } from 'vitest'
import { f, resource, type ResourceModel } from '@protobase/schema'
import { moduleDifference, retiredDifference } from '../schema-modules/module-difference'
import { computedInput } from './computed-input'
import { computedModule } from './computed-module'

const orders = () =>
  resource('orders')
    .table('orders')
    .fields({ id: f.integer().readOnly(), total: f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'lines', via: 'order_id', fn: 'sum', field: 'amount' }) })
    .primaryKey((r) => r.id)
const lines = (amount = 'quantity * price') =>
  resource('lines')
    .table('lines')
    .fields({ id: f.integer().readOnly(), order_id: f.relation('orders'), quantity: f.integer(), price: f.decimal({ precision: 10, scale: 2 }), amount: f.decimal({ precision: 12, scale: 2 }).formula(amount) })
    .primaryKey((r) => r.id)
const readings = resource('readings').table('readings').fields({ id: f.bigint().readOnly(), taken_at: f.timestamp() }).primaryKey((r) => r.id)
const hourly = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: () => [], late: '2 hours' })

const models = (...builders: { toModel: () => ResourceModel }[]) => builders.map((builder) => builder.toModel())
const written = models(orders(), lines(), readings, hourly)
const first = moduleDifference(computedModule, computedInput(written), undefined)

describe('the rollups and formulas module', () => {
  it("writes the rollups schema, each rollup's column, each formula's, the rollups' functions and triggers, and the time rollups, in that order", () => {
    const titles = first.sql!.split('\n').filter((line) => line.startsWith('-- The '))
    expect(titles).toEqual([
      '-- The schema of the functions that keep rollups and refresh time rollups.',
      '-- The column of a rollup field of orders.total.',
      '-- The generated column of a formula field of lines.amount.',
      '-- The function and trigger that keep a rollup of orders.total.',
      '-- The table and refresh function of a time rollup of readings_hourly.',
    ])
    expect(first.sql).toContain('alter table "public"."orders" add column "total" numeric(12,2);')
    expect(first.sql).toContain('create trigger "orders_total_rollup" after insert or delete or update of "order_id", "amount" on "public"."lines"')
    expect(first.breaks).toEqual([])
  })

  it("sets the rollups' values and fills the time rollups once the transaction commits, in the .after.sql", () => {
    expect(first.after).toBe(
      [
        '-- The function and trigger that keep a rollup of orders.total.\nupdate "public"."orders" as p set "total" = (select coalesce(sum(c."amount"), 0) from "public"."lines" as c where c."order_id" = p."id") where true;',
        `-- The table and refresh function of a time rollup of readings_hourly.\nselect "rollups"."readings_hourly_refresh"('-infinity');`,
      ].join('\n\n'),
    )
  })

  it('writes nothing more for the same resources', () => {
    expect(moduleDifference(computedModule, computedInput(written), first.model).sql).toBeUndefined()
  })

  it('makes a changed formula and the rollup that reads it again, dropping them first, the rollup before the formula it reads', () => {
    const { sql, after } = moduleDifference(computedModule, computedInput(models(orders(), lines('quantity * price * 2'), readings, hourly)), first.model)
    expect(sql!.split('\n').filter((line) => line.startsWith('-- The '))).toEqual([
      '-- The function and trigger that keep a rollup of orders.total, made again.',
      '-- The generated column of a formula field of lines.amount, made again.',
      '-- The generated column of a formula field of lines.amount.',
      '-- The function and trigger that keep a rollup of orders.total.',
    ])
    expect(sql).toContain('drop function if exists "rollups"."orders_total"() cascade;')
    expect(sql).toContain('-- Any index on the column goes with it, and has to be created again.\nalter table "public"."lines" drop column "amount";')
    expect(sql).toContain('-- It keeps "public"."orders"."total", numeric(12,2), from the formula ((("quantity"::numeric * "price"::numeric) * 2::numeric))::numeric(12,2).')
    expect(sql!.indexOf('drop function')).toBeLessThan(sql!.indexOf('drop column'))
    expect(after).toContain('update "public"."orders"')
  })

  it('makes a changed time rollup again by dropping its table, and fills it after', () => {
    const daily = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'day', by: () => [], late: '2 hours' })
    const { sql, after } = moduleDifference(computedModule, computedInput(models(orders(), lines(), readings, daily)), first.model)
    expect(sql).toMatch(/^-- The table and refresh function of a time rollup of readings_hourly, made again\.\ndrop table "public"\."readings_hourly";\n\n-- The table and refresh function of a time rollup of readings_hourly\.\ncreate table/)
    expect(after).toBe(`-- The table and refresh function of a time rollup of readings_hourly.\nselect "rollups"."readings_hourly_refresh"('-infinity');`)
  })

  it("drops a removed rollup's function and trigger, which breaks older code, and keeps the columns and tables it no longer has, which a field put back finds", () => {
    const plain = resource('orders').table('orders').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id)
    const removed = moduleDifference(computedModule, computedInput(models(plain, lines(), readings, hourly)), first.model)
    expect(removed.sql).toBe('-- The function and trigger that keep a rollup of orders.total, which no resource needs any more.\ndrop function if exists "rollups"."orders_total"() cascade;')
    expect(removed.breaks).toEqual(['it drops its rollups of orders.total, which the code before still runs with'])
    expect(Object.keys(removed.model.resources!.rollup_columns!)).toEqual(['orders.total'])
    expect(moduleDifference(computedModule, computedInput(written), removed.model).sql).not.toContain('add column "total"')
    const retired = retiredDifference(computedModule, first.model)
    expect(retired.sql).toBe(removed.sql)
    expect(Object.keys(retired.model.resources!)).toEqual(['rollup_columns', 'formulas', 'time_rollups'])
  })

  it('makes the rollup that reads a formula again when only the formula column type changes', () => {
    const wider = resource('lines')
      .table('lines')
      .fields({ id: f.integer().readOnly(), order_id: f.relation('orders'), quantity: f.integer(), price: f.decimal({ precision: 10, scale: 2 }), amount: f.decimal({ precision: 14, scale: 2 }).formula('quantity * price') })
      .primaryKey((r) => r.id)
    const { sql } = moduleDifference(computedModule, computedInput(models(orders(), wider, readings, hourly)), first.model)
    expect(sql!.indexOf('drop function if exists "rollups"."orders_total"() cascade;')).toBeLessThan(sql!.indexOf('drop column "amount"'))
  })

  it('makes a formula that reads a rollup again around that rollup column, dropped before it and added after it', () => {
    const order = (precision: number) =>
      resource('orders')
        .table('orders')
        .fields({ id: f.integer().readOnly(), total: f.decimal({ precision, scale: 2 }).rollup({ from: 'lines', via: 'order_id', fn: 'sum', field: 'quantity' }), doubled: f.decimal({ precision: 16, scale: 2 }).formula('total * 2') })
        .primaryKey((r) => r.id)
    const plain = resource('lines').table('lines').fields({ id: f.integer().readOnly(), order_id: f.relation('orders'), quantity: f.integer() }).primaryKey((r) => r.id)
    const before = moduleDifference(computedModule, computedInput(models(order(12), plain)), undefined)
    const { sql } = moduleDifference(computedModule, computedInput(models(order(14), plain)), before.model)
    const at = (text: string) => sql!.indexOf(text)
    expect(at('drop column "doubled"')).toBeGreaterThan(-1)
    expect(at('drop column "doubled"')).toBeLessThan(at('drop column "total"'))
    expect(at('add column "total"')).toBeLessThan(at('add column "doubled"'))
  })

  it('takes over the column of a field renamed over it, writing nothing when it is the same', () => {
    const renamed = resource('lines')
      .table('lines')
      .fields({ id: f.integer().readOnly(), order_id: f.relation('orders'), quantity: f.integer(), price: f.decimal({ precision: 10, scale: 2 }), line_amount: f.decimal({ precision: 12, scale: 2 }).column('amount').formula('quantity * price') })
      .primaryKey((r) => r.id)
    const order = resource('orders')
      .table('orders')
      .fields({ id: f.integer().readOnly(), total: f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'lines', via: 'order_id', fn: 'sum', field: 'line_amount' }) })
      .primaryKey((r) => r.id)
    const { sql, model } = moduleDifference(computedModule, computedInput(models(order, renamed, readings, hourly)), first.model)
    expect(sql ?? '').not.toContain('column "amount"')
    expect(Object.keys(model.resources!.formulas!)).toEqual(['lines.line_amount'])
  })

  it('takes a table named without a schema and one named in public as the same place, made again there rather than over it', () => {
    // Its refresh function is named for the schema the resource names, so its statements change, and it is made again.
    const qualified = resource('readings_hourly').table('public.readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: () => [], late: '2 hours' })
    const { sql } = moduleDifference(computedModule, computedInput(models(orders(), lines(), readings, qualified)), first.model)
    expect(sql).toMatch(/drop table "public"\."readings_hourly";[\s\S]*create table "public"\."readings_hourly"/)
  })
})
