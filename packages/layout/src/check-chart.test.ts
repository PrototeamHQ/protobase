import { describe, expect, it } from 'vitest'
import { Chart, Page } from './blocks'
import { pageProblems } from './check-page'
import { structureProblems } from './check-structure'
import type { ChartProps } from './blocks'
import { models } from './testing/models'

const input = { models, actions: () => new Set<string>() }
const problems = (props: ChartProps) => pageProblems({ name: 'test', title: 'Test', tree: Page({ title: 'x', children: [Chart(props)] }) }, input).map((problem) => problem.replace(/^.*?: /, ''))

describe('Chart', () => {
  it('accepts counts and totals of values and of date buckets', () => {
    expect(problems({ resource: 'invoices', groupBy: 'status', type: 'donut' })).toEqual([])
    expect(problems({ resource: 'invoices', groupBy: 'status', sum: 'total', limit: 5, filter: 'status = "open"' })).toEqual([])
    expect(problems({ resource: 'invoices', groupBy: 'issuedOn', type: 'line', average: 'total', granularity: 'month', range: '1y' })).toEqual([])
  })

  it('names a groupBy or a measure the resource cannot group or add up', () => {
    expect(problems({ resource: 'invoices', groupBy: 'nope' })).toEqual(['groupBy: unknown field "nope" on invoices'])
    expect(problems({ resource: 'invoices', groupBy: 'memo' })).toEqual(['groupBy: "memo" is not filterable, so the API refuses to group by it: mark "memo" .filterable()'])
    expect(problems({ resource: 'invoices', groupBy: 'status', sum: 'number' })).toEqual(['sum: "number" is text, and only a number can be added up'])
  })

  it('keeps a line to dates and a donut to values, with their own options', () => {
    expect(problems({ resource: 'invoices', groupBy: 'status', type: 'line', granularity: 'day' })).toEqual([
      'a line runs through time, so it needs a date or timestamp groupBy',
      '"granularity" is for a date or timestamp groupBy',
    ])
    expect(problems({ resource: 'invoices', groupBy: 'issuedOn', type: 'donut', limit: 3 })).toEqual([
      'a donut shares out values, so it needs a groupBy of values, not dates',
      '"limit" is for a groupBy of values, not dates',
    ])
    expect(problems({ resource: 'invoices', groupBy: 'status', type: 'donut', average: 'total' })).toEqual(['a donut shares out a total, and averages add up to none: count or sum instead'])
  })

  it('checks its props when written without TypeScript', () => {
    const tree = Page({ title: 'x', children: [Chart({ resource: 'invoices', groupBy: 'status', type: 'pie' as never, granularity: 'decade' as never, sum: 'total', average: 'total' })] })
    expect(structureProblems(tree)).toEqual([
      '<Page> › <Chart resource="invoices">: "type" must be bar, line, donut',
      '<Page> › <Chart resource="invoices">: "granularity" must be hour, day, week, month, year',
      '<Page> › <Chart resource="invoices">: takes "sum" or "average", not both',
    ])
  })
})
