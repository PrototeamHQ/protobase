import { describe, expect, it } from 'vitest'
import type { Catalog, CatalogColumn } from './catalog'
import { contractions } from './contractions'

const column = (name: string, number: number, rest: Partial<CatalogColumn> = {}): CatalogColumn => ({ relation: '1', name, number, type: 'text', notNull: false, hasDefault: false, generated: false, ...rest })

// A table `sales.orders` (oid 1) with two columns, a view over it, a function, a trigger and an enum.
const before: Catalog = {
  relations: [
    { oid: '1', name: 'sales.orders', kind: 'r', comment: null },
    { oid: '2', name: 'sales.open_orders', kind: 'v', comment: null },
  ],
  columns: [column('id', 1, { type: 'integer', notNull: true }), column('code', 2), column('code', 1, { relation: '2' })],
  constraints: [{ relation: '1', name: 'orders_pkey', definition: 'PRIMARY KEY (id)' }],
  uniqueIndexes: [{ relation: '1', name: 'orders_pkey', definition: 'CREATE UNIQUE INDEX orders_pkey ON sales.orders USING btree (id)' }],
  functions: [{ key: 'sales.total(integer)', result: 'integer' }, { key: 'changes.capture()', result: 'trigger' }],
  triggers: [{ relation: '1', function: 'changes.capture()', enabled: 'O', type: 1 | 4 | 8 }, { relation: '1', function: 'changes.capture()', enabled: 'O', type: 1 | 16 }],
  enums: [{ name: 'sales.state', labels: ['open', 'closed'] }],
}

const edit = (change: (catalog: Catalog) => void) => {
  const after = structuredClone(before)
  change(after)
  return contractions(before, after)
}

describe('what a migration takes from older code', () => {
  it('finds nothing when it only adds: tables, nullable or defaulted columns, limits on new tables, functions and relaxed columns', () => {
    expect(contractions(before, before)).toEqual([])
    const found = edit((after) => {
      after.relations.push({ oid: '3', name: 'sales.lines', kind: 'r', comment: null })
      after.columns.push(column('qty', 1, { relation: '3', notNull: true }), column('note', 3), column('state', 4, { notNull: true, hasDefault: true }))
      after.constraints.push({ relation: '3', name: 'lines_qty_check', definition: 'CHECK (qty > 0)' })
      after.functions.push({ key: 'sales.lines_total()', result: 'integer' })
      after.columns[0]!.notNull = false
      after.uniqueIndexes = []
      after.enums[0]!.labels.push('void')
    })
    expect(found).toEqual([])
  })

  it('takes a view, function or trigger made again as replaced, and a privilege taken back as allowed', () => {
    const found = edit((after) => {
      after.relations[1]!.oid = '9'
      after.columns[2]!.relation = '9'
      after.triggers = [{ relation: '1', function: 'changes.capture()', enabled: 'O', type: 1 | 4 | 8 | 16 }]
    })
    expect(found).toEqual([])
  })

  it('names what is dropped, renamed, moved or made again with its rows or values lost', () => {
    expect(edit((after) => (after.relations = after.relations.filter(({ name }) => name !== 'sales.orders')))).toContain('drops, renames or moves table sales.orders')
    expect(edit((after) => (after.relations[0]!.oid = '7'))).toEqual(['drops table sales.orders and makes it again, losing its rows'])
    expect(edit((after) => (after.columns = after.columns.filter(({ name, relation }) => !(relation === '1' && name === 'code'))))).toEqual(['drops or renames column sales.orders.code'])
    expect(edit((after) => (after.columns[1]!.number = 3))).toEqual(['drops column sales.orders.code and adds it again, losing its values'])
    const formula = structuredClone(before)
    formula.columns[1]!.generated = true
    const regenerated = structuredClone(formula)
    regenerated.columns[1]!.number = 3
    expect(contractions(formula, regenerated)).toEqual([])
    expect(edit((after) => (after.columns[2]!.name = 'ref'))).toEqual(['drops or renames column sales.open_orders.code'])
    expect(edit((after) => (after.functions = after.functions.slice(1)))).toEqual(['drops, renames or moves function sales.total(integer), or changes its arguments'])
    expect(edit((after) => (after.triggers = []))).toEqual(['drops or disables the trigger calling changes.capture() on sales.orders for insert, delete, update'])
    expect(edit((after) => (after.triggers[1]!.enabled = 'D'))).toEqual(['drops or disables the trigger calling changes.capture() on sales.orders for update'])
    expect(edit((after) => (after.triggers[0]!.type = 1 | 4))).toEqual(['drops or disables the trigger calling changes.capture() on sales.orders for delete'])
    expect(edit((after) => (after.enums[0]!.labels = ['open']))).toEqual(['removes the value closed of type sales.state'])
  })

  it('takes the drop of a table a step of the auth store drops as nothing, and only its drop', () => {
    const dropped = new Set(['1'])
    const without = structuredClone(before)
    without.relations = without.relations.filter(({ oid }) => oid !== '1')
    expect(contractions(before, without, dropped)).toEqual([])
    const remade = structuredClone(before)
    remade.relations[0]!.oid = '7'
    expect(contractions(before, remade, dropped)).toEqual(['drops table sales.orders and makes it again, losing its rows'])
  })

  it('names a changed type or result, a column made required, and a new limit on a table there already', () => {
    expect(edit((after) => (after.columns[1]!.type = 'integer'))).toEqual(['changes the type of column sales.orders.code from text to integer'])
    expect(edit((after) => (after.columns[1]!.notNull = true))).toEqual(['makes column sales.orders.code not null'])
    const defaulted = structuredClone(before)
    Object.assign(defaulted.columns[1]!, { notNull: true, hasDefault: true })
    const undefaulted = structuredClone(defaulted)
    undefaulted.columns[1]!.hasDefault = false
    expect(contractions(defaulted, undefaulted)).toEqual(['removes the default of the required column sales.orders.code'])
    undefaulted.columns[1]!.notNull = false
    expect(contractions(defaulted, undefaulted)).toEqual([])
    expect(edit((after) => after.columns.push(column('state', 3, { notNull: true })))).toEqual(['adds the required column sales.orders.state without a default'])
    expect(edit((after) => (after.functions[0]!.result = 'bigint'))).toEqual(['changes what function sales.total(integer) returns from integer to bigint'])
    expect(edit((after) => after.constraints.push({ relation: '1', name: 'orders_code_check', definition: "CHECK (code <> '')" }))).toEqual([
      'adds the constraint orders_code_check to sales.orders, which rows written by older code may break',
    ])
    const unique = edit((after) => {
      after.constraints.push({ relation: '1', name: 'orders_code_key', definition: 'UNIQUE (code)' })
      after.uniqueIndexes.push({ relation: '1', name: 'orders_code_key', definition: 'CREATE UNIQUE INDEX orders_code_key ON sales.orders USING btree (code)' }, { relation: '1', name: 'orders_code_lower', definition: 'CREATE UNIQUE INDEX orders_code_lower ON sales.orders USING btree (lower(code))' })
    })
    expect(unique).toEqual(['adds the constraint orders_code_key to sales.orders, which rows written by older code may break', 'adds the unique index orders_code_lower to sales.orders, which rows written by older code may break'])
  })

  it("takes a time rollup's table made again as replaced, naming only the columns older code reads that it loses", () => {
    const comment = 'protobase time rollup: create table ...'
    const rollup = structuredClone(before)
    rollup.relations[0]!.comment = comment
    const remade = (change: (after: Catalog) => void = () => {}) => {
      const after = structuredClone(rollup)
      after.relations[0]!.oid = '7'
      for (const found of [...after.columns, ...after.constraints, ...after.uniqueIndexes]) if (found.relation === '1') found.relation = '7'
      after.columns[1]!.number = 3
      change(after)
      return contractions(rollup, after)
    }
    expect(remade()).toEqual([])
    expect(remade((after) => after.uniqueIndexes.push({ relation: '7', name: 'orders_code_idx', definition: 'CREATE UNIQUE INDEX orders_code_idx ON sales.orders USING btree (code)' }))).toEqual([])
    expect(remade((after) => (after.columns = after.columns.filter(({ name, relation }) => !(relation === '7' && name === 'code'))))).toEqual(['drops or renames column sales.orders.code'])
    expect(remade((after) => (after.relations[0]!.comment = null))).toEqual(['drops table sales.orders and makes it again, losing its rows'])
  })

  it('leaves out the triggers of the watch on retired columns, which no code reads', () => {
    const watched = structuredClone(before)
    watched.functions.push({ key: 'retired.count_write()', result: 'trigger' })
    watched.triggers.push({ relation: '1', function: 'retired.count_write()', enabled: 'O', type: 1 | 4 | 16 })
    const unwatched = structuredClone(watched)
    unwatched.triggers = unwatched.triggers.filter(({ function: fn }) => fn !== 'retired.count_write()')
    expect(contractions(watched, unwatched)).toEqual([])
  })
})
