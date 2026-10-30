import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { readShapes } from './read-shapes'
import { sortIssues } from './sort-issues'

// A key that is not sortable, as the invoices app's seller has
const seller = resource('seller')
  .table('invoicing.seller')
  .fields({ id: f.integer().readOnly(), name: f.text(), city: f.text().sortable(), founded_on: f.date().filterable() })
  .primaryKey((r) => r.id)
const model = seller.toModel()

const issuesOf = (sellerView: ReturnType<typeof view<typeof seller>>) => sortIssues(model, readShapes({ models: [model], views: [sellerView.toModel()], pages: [] }))

describe('sortIssues', () => {
  it('passes a list without a sort on a key that is not sortable, which opens in no order of its own', () => {
    expect(issuesOf(view<typeof seller>('seller').list((r) => ({ columns: [r.name, r.city] })))).toEqual([])
  })

  it('passes a list sorted by a sortable field', () => {
    expect(issuesOf(view<typeof seller>('seller').list((r) => ({ columns: [r.name], sort: [[r.city, 'asc']] })))).toEqual([])
  })

  it('reports a list sorted by a field that is not sortable, with the read the API refuses', () => {
    expect(issuesOf(view<typeof seller>('seller').list((r) => ({ columns: [r.name], sort: [[r.name, 'asc']] })))).toEqual([
      {
        severity: 'error',
        resource: 'seller',
        message: "name: not sortable, so the API refuses:\n            GET /seller?order_by=name asc (the seller list's order)",
        suggestion: 'mark "name" .sortable() in data.ts, or sort the list by a sortable field',
      },
    ])
  })

  it('reports a sort the app picks itself, such as a calendar by its start, once per field', () => {
    const issues = issuesOf(
      view<typeof seller>('seller')
        .list((r, d) => ({ columns: [r.name], displays: [d.calendar({ start: r.founded_on }), d.timeline({ start: r.founded_on })] }))
        .nav({ recent: { orderBy: 'name desc' } }),
    )
    expect(issues.map((issue) => issue.message)).toEqual([
      'founded_on: not sortable, so the API refuses:\n            GET /seller?filter=founded_on >= … AND founded_on < …&order_by=founded_on asc (the calendar display "calendar"; the timeline display "timeline")',
      'name: not sortable, so the API refuses:\n            GET /seller?order_by=name desc (the recent records in the sidebar)',
    ])
  })
})
