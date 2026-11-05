import { describe, expect, it } from 'vitest'
import { memorySheetSource } from '../sheet-source'
import { createTableOps } from './create-table-ops'
import { hasProblems, proposalProblems } from './proposal-problems'
import { readColumns } from './read-columns'
import { changeField, proposeTable } from './table-proposal'

const source = memorySheetSource([
  { line: 1, cells: ['Name', 'Visits', 'name', '', 'Order'] },
  { line: 2, cells: ['Hoogland', '12', 'x', true, '007'] },
  { line: 3, cells: [null, null, null, null, null] },
  { line: 4, cells: ['De Spaak', '1.5', 'y', false, '1,5'] },
])

const proposed = async (taken: string[] = []) => proposeTable('Trade fair 2026.xlsx', await readColumns(source, undefined, () => {}), taken, 63)

describe('readColumns', () => {
  it('reads every row once, skipping empty ones, and keeps the first as a sample', async () => {
    const progress: number[] = []
    const read = await readColumns(source, undefined, (rows) => progress.push(rows))
    expect(read.rows).toBe(2)
    expect(progress).toEqual([2])
    expect(read.sample.map((row) => row.line)).toEqual([2, 4])
    expect(read.types.map((type) => type.type)).toEqual(['text', 'decimal', 'text', 'boolean', 'text'])
  })
})

describe('proposeTable', () => {
  it('names the table after the file and each field after its header, never two alike', async () => {
    const proposal = await proposed(['trade_fair_2026'])
    expect(proposal).toMatchObject({ name: 'trade_fair_2026_2', pluralLabel: 'Trade fair 2026', singularLabel: '', titleField: 'name' })
    expect(proposal.fields.map((field) => [field.name, field.label, field.type])).toEqual([
      ['name', 'Name', 'text'],
      ['visits', 'Visits', 'decimal'],
      ['name_2', 'name', 'text'],
      ['column_d', 'Column D', 'boolean'],
      ['order_2', 'Order', 'text'],
    ])
  })

  it('moves the title off a field that is left out or no longer text', async () => {
    const proposal = await proposed()
    expect(changeField(proposal, 0, { include: false }).titleField).toBeUndefined()
    expect(changeField(proposal, 0, { type: 'long_text' }).titleField).toBeUndefined()
    expect(changeField(proposal, 0, { name: 'company' }).titleField).toBe('company')
    expect(changeField(proposal, 2, { include: false }).titleField).toBe('name')
  })
})

describe('proposalProblems', () => {
  it('asks for the singular label, and refuses two fields of one name, a reserved one and a taken table name', async () => {
    const proposal = await proposed()
    expect(proposalProblems(proposal, new Set(), 63)).toMatchObject({ singularLabel: expect.any(String), fields: {} })
    const named = changeField(changeField({ ...proposal, singularLabel: 'Contact' }, 2, { name: 'name' }), 1, { name: 'select' })
    const problems = proposalProblems(named, new Set(['trade_fair_2026']), 63)
    expect(Object.keys(problems.fields)).toEqual(['1', '2'])
    expect(problems.name).toBeDefined()
    expect(hasProblems(proposalProblems({ ...proposal, singularLabel: 'Contact' }, new Set(), 63))).toBe(false)
  })

  it('refuses a label longer than a table or field takes', async () => {
    const proposal = changeField({ ...(await proposed()), singularLabel: 'Contact' }, 0, { label: 'x'.repeat(201) })
    expect(proposalProblems(proposal, new Set(), 63).fields[0]?.label).toBeDefined()
  })

  it('needs a field', async () => {
    let proposal = await proposed()
    for (const column of [0, 1, 2, 3, 4]) proposal = changeField(proposal, column, { include: false })
    expect(proposalProblems(proposal, new Set(), 63).noFields).toBeDefined()
  })
})

describe('createTableOps', () => {
  it('makes the table, its included fields in order with a decimal size, and its title in one batch', async () => {
    const proposal = changeField({ ...(await proposed()), singularLabel: 'Contact' }, 2, { include: false })
    expect(createTableOps('user_tables', proposal)).toEqual([
      { op: 'create', resource: 'user_tables', ref: 'table', data: { name: 'trade_fair_2026', singular_label: 'Contact', plural_label: 'Trade fair 2026' } },
      { op: 'create', resource: 'user_table_fields', data: { table_id: { $ref: 'table' }, name: 'name', label: 'Name', type: 'text', position: 1 } },
      { op: 'create', resource: 'user_table_fields', data: { table_id: { $ref: 'table' }, name: 'visits', label: 'Visits', type: 'decimal', position: 2, precision: 16, scale: 1 } },
      { op: 'create', resource: 'user_table_fields', data: { table_id: { $ref: 'table' }, name: 'column_d', label: 'Column D', type: 'boolean', position: 3 } },
      { op: 'create', resource: 'user_table_fields', data: { table_id: { $ref: 'table' }, name: 'order_2', label: 'Order', type: 'text', position: 4 } },
      { op: 'update', resource: 'user_tables', key: { $ref: 'table' }, etag: '*', data: { title_field: 'name' } },
    ])
  })
})
