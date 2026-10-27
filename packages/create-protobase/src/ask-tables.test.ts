import { describe, expect, it } from 'vitest'
import { askTables, tableMenu, tablesForAnswer, withReferenced, type DatabaseTable } from './ask-tables'

const keys = ['public.customers', 'public.orders', 'sales.orders', 'sales.order_lines']

describe('tablesForAnswer', () => {
  it('takes every table for an empty answer or all', () => {
    expect(tablesForAnswer(keys, ' ')).toEqual(keys)
    expect(tablesForAnswer(keys, 'all\n')).toEqual(keys)
  })

  it('takes numbers, ranges and names, in the order of the list', () => {
    expect(tablesForAnswer(keys, '4, 1')).toEqual(['public.customers', 'sales.order_lines'])
    expect(tablesForAnswer(keys, '2-3,3')).toEqual(['public.orders', 'sales.orders'])
    expect(tablesForAnswer(keys, 'sales.orders,customers')).toEqual(['public.customers', 'sales.orders'])
  })

  it('has nothing for a part that names no table, or two', () => {
    expect(tablesForAnswer(keys, '5')).toBeUndefined()
    expect(tablesForAnswer(keys, '0')).toBeUndefined()
    expect(tablesForAnswer(keys, '3-2')).toBeUndefined()
    expect(tablesForAnswer(keys, 'orders')).toBeUndefined()
    expect(tablesForAnswer(keys, '1,invoices')).toBeUndefined()
  })
})

describe('withReferenced', () => {
  const table = (name: string, references: string[] = []): DatabaseTable => ({ schema: 'shop', name, columns: 2, references })
  const tables = [table('customers'), table('order_lines', ['shop.orders', 'shop.products']), table('orders', ['shop.customers']), table('products'), table('tags')]

  it('adds the tables the picked ones point to, and those they point to, in the order of the list', () => {
    expect(withReferenced(tables, ['shop.order_lines'])).toEqual(['shop.customers', 'shop.order_lines', 'shop.orders', 'shop.products'])
    expect(withReferenced(tables, ['shop.tags'])).toEqual(['shop.tags'])
  })

  it('ends on a cycle of foreign keys', () => {
    const cycle = [table('a', ['shop.b']), table('b', ['shop.a'])]
    expect(withReferenced(cycle, ['shop.a'])).toEqual(['shop.a', 'shop.b'])
  })
})

describe('tableMenu', () => {
  it('numbers the tables with their columns and lists what is left out', () => {
    const tables = [
      { schema: 'public', name: 'customers', columns: 5, references: [] },
      { schema: 'public', name: 'tags', columns: 1, references: [] },
    ]
    expect(tableMenu('shop', tables, ['public.order_totals: a view'])).toBe(
      ['', 'Tables in shop:', '  1. public.customers  5 columns', '  2. public.tags       1 column', 'Left out:', '  public.order_totals: a view', ''].join('\n'),
    )
  })
})

describe('askTables', () => {
  it('asks again until the answer names tables', async () => {
    const answers = ['9', '2']
    const printed: string[] = []
    const tables = keys.map((key) => ({ schema: key.split('.')[0]!, name: key.split('.')[1]!, columns: 2, references: [] }))
    expect(await askTables(tables, async () => answers.shift()!, (text) => printed.push(text))).toEqual(['public.orders'])
    expect(printed).toEqual(['  pick numbers from 1 to 4, ranges of them or table names, separated by commas\n'])
  })
})
