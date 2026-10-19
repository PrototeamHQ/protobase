import { describe, expect, it } from 'vitest'
import { f, resource, type ResourceModel } from '@protobase/schema'
import { computedPlan, type ComputedState } from './computed-plan'
import { rollupBody } from './rollup-sql'
import { rollupTargets } from './rollup-targets'

const orders = resource('orders')
  .table('orders')
  .fields({
    id: f.integer().readOnly(),
    total: f.decimal({ precision: 12, scale: 2 }).rollup({ from: 'lines', via: 'order_id', fn: 'sum', field: 'amount' }),
  })
  .primaryKey((r) => r.id)
  .toModel()
const lines = resource('lines')
  .table('lines')
  .fields({
    id: f.integer().readOnly(),
    order_id: f.relation('orders'),
    quantity: f.integer(),
    price: f.decimal({ precision: 10, scale: 2 }),
    amount: f.decimal({ precision: 12, scale: 2 }).formula('quantity * price'),
    deleted_at: f.timestamp().optional(),
  })
  .primaryKey((r) => r.id)
  .softDelete((r) => r.deleted_at)
  .toModel()

const amountSql = '(("quantity"::numeric * "price"::numeric))::numeric(12,2)'

const empty: ComputedState = {
  tables: { orders: { oid: '1', sql: 'public.orders' }, lines: { oid: '2', sql: 'public.lines' } },
  columns: [],
  functions: [],
  triggers: [],
}

// The state once the plan of `empty` was applied.
const applied = (models: ResourceModel[]): ComputedState => ({
  ...empty,
  columns: [
    { table: '1', name: 'total', type: 'numeric(12,2)', generated: false, comment: null },
    { table: '2', name: 'amount', type: 'numeric(12,2)', generated: true, comment: `protobase formula: ${amountSql}` },
  ],
  functions: [{ oid: '10', name: 'orders_total', source: rollupBody(rollupTargets(models, (model) => `public.${model.table.name}`)[0]!), definer: true }],
  triggers: [{ table: '2', tableSql: 'public.lines', name: 'orders_total_rollup', function: '10' }],
})

describe('computedPlan', () => {
  it('adds the rollup column, then the formula, then the function, trigger and values of the rollup', () => {
    const plan = computedPlan([orders, lines], empty)
    expect(plan.behind).toEqual(['lines.amount', 'orders.total'])
    expect(plan.statements).toEqual([
      'create schema if not exists "rollups"',
      'drop trigger if exists "orders_total_rollup" on public.lines',
      'alter table public.orders add column "total" numeric(12,2)',
      `alter table public.lines add column "amount" numeric(12,2) generated always as (${amountSql}) stored`,
      `comment on column public.lines."amount" is 'protobase formula: ${amountSql}'`,
      expect.stringMatching(/^create or replace function "rollups"\."orders_total"\(\) returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp/),
      'create trigger "orders_total_rollup" after insert or delete or update of "order_id", "amount", "deleted_at" on public.lines for each row execute function "rollups"."orders_total"()',
      'update public.orders as p set "total" = (select coalesce(sum(c."amount"), 0) from public.lines as c where c."order_id" = p."id" and c."deleted_at" is null) where true',
    ])
  })

  it('has nothing to do once applied, and drops the function of a rollup that is gone', () => {
    expect(computedPlan([orders, lines], applied([orders, lines]))).toEqual({ statements: [], behind: [] })
    const plain = { ...orders, fields: { id: orders.fields.id! } }
    expect(computedPlan([plain, lines], applied([orders, lines])).statements).toEqual(['drop function if exists "rollups"."orders_total"() cascade'])
  })

  it('writes a changed rollup again, values included', () => {
    const counted = resource('orders').table('orders').fields({ id: f.integer().readOnly(), total: f.decimal({ precision: 12, scale: 2 }).optional().rollup({ from: 'lines', via: 'order_id', fn: 'max', field: 'amount' }) }).primaryKey((r) => r.id).toModel()
    const plan = computedPlan([counted, lines], applied([orders, lines]))
    expect(plan.behind).toEqual(['orders.total'])
    expect(plan.statements.at(-1)).toContain('(select max(c."amount") from public.lines')
  })

  it('generates a changed formula again, with the trigger of a rollup that reads it', () => {
    const state = applied([orders, lines])
    state.columns[1] = { ...state.columns[1]!, comment: 'protobase formula: ("quantity")::numeric(12,2)' }
    const plan = computedPlan([orders, lines], state)
    expect(plan.behind).toEqual(['lines.amount', 'orders.total'])
    expect(plan.statements.slice(0, 3)).toEqual([
      'create schema if not exists "rollups"',
      'drop trigger if exists "orders_total_rollup" on public.lines',
      expect.stringMatching(/^-- The formula of "lines.amount" changed: .*\nalter table public.lines drop column "amount"$/),
    ])
    expect(plan.statements.at(-2)).toMatch(/^create trigger "orders_total_rollup"/)
  })

  it('refuses columns and triggers of the project\'s own', () => {
    const state = applied([orders, lines])
    expect(() => computedPlan([orders, lines], { ...state, columns: [{ ...state.columns[0]!, type: 'integer' }, state.columns[1]!] })).toThrow('Column public.orders."total" of rollup field "orders.total" is integer, not numeric(12,2) as the field declares')
    expect(() => computedPlan([orders, lines], { ...state, columns: [state.columns[0]!, { ...state.columns[1]!, generated: false }] })).toThrow('is a plain column')
    expect(() => computedPlan([orders, lines], { ...state, columns: [state.columns[0]!, { ...state.columns[1]!, comment: null }] })).toThrow("is a generated column of the project's own")
    expect(() => computedPlan([orders, lines], { ...state, triggers: [{ ...state.triggers[0]!, function: '99' }] })).toThrow('Table public.lines has a trigger "orders_total_rollup" of its own')
  })

  it('refuses a rollup whose resource, relation or field is not there', () => {
    expect(() => computedPlan([orders], empty)).toThrow('Resource "orders": rollup field "total" rolls up "lines", which is not a resource')
    const other = { ...lines, fields: { ...lines.fields, order_id: { ...lines.fields.order_id!, relation: { resource: 'customers', columns: ['order_id'] } } } }
    expect(() => computedPlan([orders, other], empty)).toThrow('is via "order_id", which is no relation of "lines" to "orders"')
  })
})
