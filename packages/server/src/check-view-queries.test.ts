import { describe, expect, it } from 'vitest'
import { f, resource, view } from '@protobase/schema'
import { checkViewQueries } from './check-view-queries'

const listings = resource('listings')
  .table('listings')
  .fields({
    id: f.integer().filterable().sortable(),
    address: f.text().filterable().sortable(),
    district: f.text(),
    price: f.integer().filterable(),
    garden: f.boolean().filterable(),
    balcony: f.boolean(),
    published_at: f.timestamp().sortable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.address])

const models = [listings.toModel()]

describe('checkViewQueries', () => {
  it('takes a view whose filters, sort and search use fields the resource allows them on', () => {
    const fits = view<typeof listings>('listings')
      .list((r) => ({ columns: [r.address], sort: [[r.address, 'asc']], search: [r.address] }))
      .filters((r, w) => [w.facets(r.address), w.range(r.price), w.toggle(r.garden)])
    expect(() => checkViewQueries(models, [fits.toModel()])).not.toThrow()
  })

  it("refuses a named list's sort by a field that is not sortable, naming the list", () => {
    const named = view<typeof listings>('listings').namedList('recent', (v) => v.names({ singular: 'Listing', plural: 'Recent' }).list((r) => ({ columns: [r.address], sort: [[r.price, 'asc']] })))
    expect(() => checkViewQueries(models, [named.toModel()])).toThrow('View "listings" list "recent": the list sorts by "price", which is not sortable')
  })

  // property-finder's listings offered a district filter on a field that was not filterable, refused once used.
  it('refuses a filter widget on a field that is not filterable, naming the view, the field and the fix', () => {
    const district = view<typeof listings>('listings').filters((r, w) => [w.facets(r.district)])
    expect(() => checkViewQueries(models, [district.toModel()])).toThrow(
      'The views ask for what their resources do not allow:\n  - View "listings": the facets filter uses "district", which is not filterable, so the API refuses it: mark "district" .filterable()',
    )
  })

  it('refuses each field of a flags filter, and a chart, on fields that are not filterable', () => {
    const flags = view<typeof listings>('listings').filters((r, w) => [w.flags([r.garden, r.balcony], { label: 'Outside' })]).chart((r) => ({ field: r.published_at, range: '30d', granularity: 'day' }))
    expect(() => checkViewQueries(models, [flags.toModel()])).toThrow(/the flags filter uses "balcony", which is not filterable[\s\S]*the chart uses "published_at", which is not filterable/)
  })

  it('refuses a list sorted by a field that is not sortable, and searched by one the resource does not search', () => {
    const list = view<typeof listings>('listings').list((r) => ({ columns: [r.address], sort: [[r.price, 'desc']], search: [r.district] }))
    expect(() => checkViewQueries(models, [list.toModel()])).toThrow(/the list sorts by "price", which is not sortable[\s\S]*the list searches "district", which listings does not search/)
  })

  it('leaves a view of a resource it does not know to the other checks', () => {
    const other = view<typeof listings>('listings').filters((r, w) => [w.facets(r.district)]).toModel()
    expect(() => checkViewQueries([], [other])).not.toThrow()
  })

  it('takes a list filter on filterable fields and refuses one that is not filterable or does not parse', () => {
    const ok = view<typeof listings>('listings').list((r) => ({ columns: [r.address], filter: 'price > 10 AND garden = true' }))
    expect(() => checkViewQueries(models, [ok.toModel()])).not.toThrow()
    const open = view<typeof listings>('listings').list((r) => ({ columns: [r.address], filter: 'district = "x"' }))
    expect(() => checkViewQueries(models, [open.toModel()])).toThrow(/the list's filter: /)
    const broken = view<typeof listings>('listings').list((r) => ({ columns: [r.address], filter: 'price >' }))
    expect(() => checkViewQueries(models, [broken.toModel()])).toThrow(/the list's filter: /)
  })
})
