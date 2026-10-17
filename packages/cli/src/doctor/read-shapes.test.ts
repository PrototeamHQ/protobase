import { describe, expect, it } from 'vitest'
import { Page, RecordRow, Stat, page } from '@protobase/layout'
import { f, l, resource, view } from '@protobase/schema'
import { readShapes } from './read-shapes'

const places = resource('places')
  .table('market.places')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    name: f.text().filterable().sortable(),
    region: f.text().filterable(),
    country: f.enum(['NL', 'ES']).filterable(),
    population: f.integer().filterable(),
    coastal: f.boolean().filterable(),
    capital: f.boolean().filterable(),
  })
  .primaryKey((r) => r.id)
  .search((r) => [r.name])

const agencies = resource('agencies')
  .table('market.agencies')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    name: f.text(),
    place_id: f.relation('places').filterable(),
    owner_id: f.text(),
    opened_at: f.timestamp().filterable().sortable(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.owner_id)

const placesView = view<typeof places>('places')
  .list((r, d) => ({ columns: [r.name], sort: [[r.name, 'asc']], displays: [d.board({ by: r.country })] }))
  .filters((r, w) => [w.facets(r.region), w.facets(r.population), w.toggle(r.coastal), w.flags([r.coastal, r.capital], { label: 'Kind' })])
  .layout(() => [
    l.related('Agencies', { resource: 'agencies', field: 'place_id', filter: 'opened_at > now() - 30d', sort: 'opened_at desc' }),
    // The agencies stand in for photos: the shape reads only the relation and the order
    l.gallery('Agency photos', { photos: { resource: 'agencies', field: 'place_id', image: 'name', sort: 'opened_at desc' } }),
  ])

const home = page(
  'home',
  Page({ title: 'Home', children: [RecordRow({ title: 'Big places', resource: 'places', filter: 'population > 100000' }), Stat({ label: 'Agencies', resource: 'agencies', filter: 'place_id = 1' })] }),
)

const shapes = readShapes({ models: [places.toModel(), agencies.toModel()], views: [placesView.toModel()], pages: [home.toModel()] })
const requests = (resource: string) => shapes.filter((shape) => shape.resource === resource).map((shape) => `${shape.request} (${shape.from})`)

describe('readShapes', () => {
  it('takes a sort by each sortable field, a filter on each filterable one and the search', () => {
    expect(requests('places')).toEqual(
      expect.arrayContaining([
        'GET /places?order_by=name asc ("name" is sortable)',
        'GET /places?filter=region = … ("region" is filterable)',
        'GET /places?filter=search("…") (the search over name)',
      ]),
    )
    expect(requests('places')).not.toContain('GET /places?order_by=region asc ("region" is sortable)')
  })

  it("reads a list in its view's order and counts a facets widget's values", () => {
    const of = shapes.filter((shape) => shape.resource === 'places')
    expect(of.find((shape) => shape.from === "the places list's order")).toMatchObject({ request: 'GET /places?order_by=name asc', query: { sort: [['name', 'asc']] } })
    expect(of.find((shape) => shape.request === 'GET /places:facets?field=region')).toMatchObject({ from: "the places list's facets filter", query: { groupBy: 'region' } })
    expect(of.find((shape) => shape.request === 'GET /places?filter=region in (…)')?.query.filter).toMatchObject({ kind: 'in', field: { name: 'region' } })
  })

  it('reads a facets widget on a number as a range, a toggle as true and flags each counted and ORed', () => {
    expect(requests('places')).toEqual(
      expect.arrayContaining([
        "GET /places?filter=population >= … AND population <= … (the places list's facets filter)",
        "GET /places?filter=coastal = true (the places list's toggle filter)",
        "GET /places:facets?field=capital (the places list's flags filter)",
        "GET /places?filter=coastal = true OR capital = true (the places list's flags filter)",
      ]),
    )
    expect(requests('places')).not.toContain("GET /places:facets?field=population (the places list's facets filter)")
  })

  it("reads each column of a board by its value, in the list's order", () => {
    const board = shapes.find((shape) => shape.from === 'the board display "board"')
    expect(board).toMatchObject({ resource: 'places', request: 'GET /places?filter=country = …&order_by=name asc', query: { sort: [['name', 'asc']] } })
    expect(board?.query.filter).toMatchObject({ kind: 'compare', field: { name: 'country' } })
  })

  it("reads a gallery's photos by this record's key, in their order", () => {
    const gallery = shapes.find((shape) => shape.from === 'gallery "Agency photos" on the places record page')
    expect(gallery).toMatchObject({ resource: 'agencies', request: 'GET /agencies?filter=place_id = …&order_by=opened_at desc', query: { sort: [['opened_at', 'desc']] } })
    expect(gallery?.query.filter).toMatchObject({ kind: 'compare', field: { name: 'place_id' } })
  })

  it("reads a related section's records by this record's key, with its filter and sort", () => {
    const related = shapes.find((shape) => shape.from === 'related "Agencies" on the places record page')
    expect(related).toMatchObject({ resource: 'agencies', request: 'GET /agencies?filter=place_id = … AND (opened_at > now() - 30d)&order_by=opened_at desc', query: { sort: [['opened_at', 'desc']] } })
    expect(related?.query.filter).toMatchObject({ kind: 'and', args: [{ kind: 'compare', field: { name: 'place_id' } }, { kind: 'compare', op: '>', field: { name: 'opened_at' } }] })
  })

  it("reads a page's blocks, a RecordRow in the list's order when it names none", () => {
    expect(requests('places')).toContain('GET /places?filter=population > 100000&order_by=name asc (page "home", <RecordRow "Big places">)')
    expect(requests('agencies')).toContain('GET /agencies?filter=place_id = 1 (page "home", <Stat "Agencies">)')
  })

  it('looks up the names a relation shows by their keys, and limits a role with own capabilities to its rows', () => {
    expect(shapes.find((shape) => shape.from === 'the names agencies.place_id shows')).toMatchObject({ resource: 'places', request: 'GET /places?filter=id in (…)' })
    expect(shapes.find((shape) => shape.from === '"owner_id" is the owner')).toMatchObject({ resource: 'agencies', query: {}, scope: { rowFilter: { kind: 'compare', field: { name: 'owner_id' } } } })
  })
})
