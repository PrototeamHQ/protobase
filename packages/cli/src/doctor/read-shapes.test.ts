import { describe, expect, it } from 'vitest'
import { Chart, Page, RecordCards, RecordRow, Stat, page } from '@protobase/layout'
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
    founded_on: f.date().filterable(),
    dissolved_on: f.date().filterable(),
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
  .list((r, d) => ({ columns: [r.name], sort: [[r.name, 'asc']], displays: [d.board({ by: r.country }), d.calendar({ start: r.founded_on }), d.calendar({ start: r.founded_on, end: r.dissolved_on }, { name: 'spans' }), d.timeline({ start: r.founded_on, end: r.dissolved_on, group: r.country })] }))
  .filters((r, w) => [w.facets(r.region), w.facets(r.population), w.toggle(r.coastal), w.flags([r.coastal, r.capital], { label: 'Kind' })])
  .chart((r) => ({ groupBy: r.country, type: 'donut' }))
  .layout(() => [
    l.related('Agencies', { resource: 'agencies', field: 'place_id', filter: 'opened_at > now() - 30d', sort: 'opened_at desc' }),
    // The agencies stand in for photos: the shape reads only the relation and the order
    l.gallery('Agency photos', { photos: { resource: 'agencies', field: 'place_id', image: 'name', sort: 'opened_at desc' } }),
    // The agencies stand in for samples: the shape reads only the relation and the time
    l.chart('Openings', { resource: 'agencies', field: 'place_id', at: 'opened_at', series: ['id'] }),
  ])

const home = page(
  'home',
  Page({ title: 'Home', children: [RecordRow({ title: 'Big places', resource: 'places', filter: 'population > 100000' }), RecordCards({ title: 'Coast', resource: 'places', filter: 'coastal = true', layout: 'carousel' }), Stat({ label: 'Agencies', resource: 'agencies', filter: 'place_id = 1' }), Chart({ title: 'By country', resource: 'places', groupBy: 'country', filter: 'coastal = true' }), Chart({ title: 'Founded by country', resource: 'places', groupBy: 'founded_on', splitBy: 'country' })] }),
)

const shapes = readShapes({ models: [places.toModel(), agencies.toModel()], views: [placesView.toModel()], pages: [home.toModel()] })
const requests = (resource: string) => shapes.filter((shape) => shape.resource === resource).map((shape) => `${shape.request} (${shape.from})`)

describe('readShapes', () => {
  it("reads the records sorted by hand in their order: all of them, or each parent's", () => {
    const lists = resource('lists').table('lists').fields({ id: f.integer().filterable().sortable(), rank: f.integer().sortable() }).primaryKey((r) => r.id).position((r) => r.rank)
    const entries = resource('entries')
      .table('entries')
      .fields({ id: f.integer().filterable().sortable(), list_id: f.relation('lists').filterable(), position: f.integer().sortable() })
      .primaryKey((r) => r.id)
      .position((r) => r.position, { within: (r) => r.list_id })
    const listsView = view<typeof lists>('lists').layout(() => [l.related('Entries', { resource: 'entries', field: 'list_id' })])
    const sorted = readShapes({ models: [lists.toModel(), entries.toModel()], views: [listsView.toModel(), view<typeof entries>('entries').toModel()], pages: [] }).filter((shape) => shape.from.endsWith('sorted by hand'))
    expect(sorted.map((shape) => shape.request)).toEqual(['GET /lists?order_by=rank asc', 'GET /entries?filter=list_id = …&order_by=position asc'])
    expect(sorted[1]!.query).toMatchObject({ filter: { kind: 'compare', field: { name: 'list_id' } }, sort: [['position', 'asc']] })
  })

  it('reads the filter of a related section matching a field of the record, and no hand order', () => {
    const lists = resource('lists').table('lists').fields({ id: f.integer().filterable().sortable() }).primaryKey((r) => r.id)
    const entries = resource('entries')
      .table('entries')
      .fields({ id: f.integer().filterable().sortable(), list_id: f.relation('lists').filterable(), position: f.integer().sortable() })
      .primaryKey((r) => r.id)
      .position((r) => r.position, { within: (r) => r.list_id })
    const listsView = view<typeof lists>('lists').layout(() => [l.related('Entries', { resource: 'entries', field: 'list_id', from: 'id' })])
    const found = readShapes({ models: [lists.toModel(), entries.toModel()], views: [listsView.toModel(), view<typeof entries>('entries').toModel()], pages: [] })
    expect(found.some((shape) => shape.from.endsWith('sorted by hand') && shape.resource === 'entries')).toBe(false)
    expect(found.some((shape) => shape.resource === 'entries' && shape.request.includes('list_id = …'))).toBe(true)
  })

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
    expect(of.find((shape) => shape.from === "the places list's chart")).toMatchObject({ request: 'GET /places:aggregate?group_by=country', query: { groupBy: 'country' } })
  })

  it('reads both columns of a split chart', () => {
    const split = shapes.filter((shape) => shape.from === 'page "home", <Chart "Founded by country">')
    expect(split).toMatchObject([
      { request: 'GET /places:aggregate?group_by=founded_on', query: { groupBy: 'founded_on' } },
      { request: 'GET /places:aggregate?group_by=founded_on&split_by=country', query: { groupBy: 'country' } },
    ])
  })

  it("reads a named list's opening filter and widgets as its own", () => {
    const named = view<typeof places>('places').namedList('coastal', (v) =>
      v
        .names({ singular: 'Coastal place', plural: 'Coastal places' })
        .list((r) => ({ columns: [r.name], sort: [[r.name, 'asc']], filter: 'coastal = true' }))
        .filters((r, w) => [w.facets(r.country)]),
    )
    const of = readShapes({ models: [places.toModel()], views: [named.toModel()], pages: [] }).filter((shape) => shape.resource === 'places')
    expect(of.find((shape) => shape.from === 'the places list "coastal" as it opens')).toMatchObject({ request: 'GET /places?filter=coastal = true&order_by=name asc' })
    expect(of.find((shape) => shape.request === 'GET /places:facets?field=country')).toMatchObject({ from: 'the places list "coastal"\'s facets filter' })
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

  it('reads each column of a board of ranked records in their rank', () => {
    const tasks = resource('tasks').table('tasks').fields({ id: f.integer().filterable().sortable(), status: f.enum(['todo', 'done']).filterable(), rank: f.integer().sortable() }).primaryKey((r) => r.id).position((r) => r.rank)
    const tasksView = view<typeof tasks>('tasks').list((r, d) => ({ columns: [r.status], displays: [d.board({ by: r.status })] }))
    const board = readShapes({ models: [tasks.toModel()], views: [tasksView.toModel()], pages: [] }).find((shape) => shape.from === 'the board display "board"')
    expect(board).toMatchObject({ request: 'GET /tasks?filter=status = …&order_by=rank asc', query: { sort: [['rank', 'asc']] } })
  })

  it('reads the days a calendar shows by its start, and by its end too when it has one, in start order', () => {
    const calendar = shapes.find((shape) => shape.from === 'the calendar display "calendar"')
    expect(calendar).toMatchObject({ resource: 'places', request: 'GET /places?filter=founded_on >= … AND founded_on < …&order_by=founded_on asc', query: { sort: [['founded_on', 'asc']] } })
    expect(calendar?.query.filter).toMatchObject({ kind: 'and', args: [{ op: '>=', field: { name: 'founded_on' } }, { op: '<', field: { name: 'founded_on' } }] })
    const spans = shapes.find((shape) => shape.from === 'the calendar display "spans"')
    expect(spans?.request).toBe('GET /places?filter=(founded_on >= … AND founded_on < …) OR (founded_on < … AND dissolved_on >= …)&order_by=founded_on asc')
    expect(spans?.query.filter).toMatchObject({ kind: 'or', args: [{ kind: 'and' }, { kind: 'and', args: [{ field: { name: 'founded_on' } }, { op: '>=', field: { name: 'dissolved_on' } }] }] })
    const timeline = shapes.find((shape) => shape.from === 'the timeline display "timeline"')
    expect(timeline?.request).toBe(spans?.request)
  })

  it("reads a gallery's photos by this record's key, in their order", () => {
    const gallery = shapes.find((shape) => shape.from === 'gallery "Agency photos" on the places record page')
    expect(gallery).toMatchObject({ resource: 'agencies', request: 'GET /agencies?filter=place_id = …&order_by=opened_at desc', query: { sort: [['opened_at', 'desc']] } })
    expect(gallery?.query.filter).toMatchObject({ kind: 'compare', field: { name: 'place_id' } })
  })

  it("groups a chart's records of this record by their time", () => {
    const chart = shapes.find((shape) => shape.from === 'chart "Openings" on the places record page')
    expect(chart).toMatchObject({ resource: 'agencies', request: 'GET /agencies:aggregate?group_by=opened_at&filter=place_id = …', query: { groupBy: 'opened_at' } })
    expect(chart?.query.filter).toMatchObject({ kind: 'compare', field: { name: 'place_id' } })
  })

  it("reads a related section's records by this record's key, with its filter and sort", () => {
    const related = shapes.find((shape) => shape.from === 'related "Agencies" on the places record page')
    expect(related).toMatchObject({ resource: 'agencies', request: 'GET /agencies?filter=place_id = … AND (opened_at > now() - 30d)&order_by=opened_at desc', query: { sort: [['opened_at', 'desc']] } })
    expect(related?.query.filter).toMatchObject({ kind: 'and', args: [{ kind: 'compare', field: { name: 'place_id' } }, { kind: 'compare', op: '>', field: { name: 'opened_at' } }] })
  })

  it("reads a page's blocks, a RecordRow or RecordCards in the list's order when it names none", () => {
    expect(requests('places')).toContain('GET /places?filter=population > 100000&order_by=name asc (page "home", <RecordRow "Big places">)')
    expect(requests('places')).toContain('GET /places?filter=coastal = true&order_by=name asc (page "home", <RecordCards "Coast">)')
    expect(requests('agencies')).toContain('GET /agencies?filter=place_id = 1 (page "home", <Stat "Agencies">)')
    expect(shapes.find((shape) => shape.from === 'page "home", <Chart "By country">')).toMatchObject({ request: 'GET /places:aggregate?group_by=country&filter=coastal = true', query: { groupBy: 'country' } })
  })

  it('looks up the names a relation shows by their keys, and limits a role with own capabilities to its rows', () => {
    expect(shapes.find((shape) => shape.from === 'the names agencies.place_id shows')).toMatchObject({ resource: 'places', request: 'GET /places?filter=id in (…)' })
    expect(shapes.find((shape) => shape.from === '"owner_id" is the owner')).toMatchObject({ resource: 'agencies', query: {}, scope: { rowFilter: { kind: 'compare', field: { name: 'owner_id' } } } })
  })

  it('keeps every read of a resource with a read parent to the relation, but not one with an update parent', () => {
    const offices = resource('offices').table('market.offices')
      .fields({ id: f.integer(), agency_id: f.relation('agencies'), place_id: f.relation('places') })
      .primaryKey((r) => r.id).parent((r) => r.agency_id, 'read').parent((r) => r.place_id, 'update')
    const found = readShapes({ models: [offices.toModel()], views: [], pages: [] }).filter((shape) => shape.scope?.parents)
    expect(found).toMatchObject([{ resource: 'offices', request: 'GET /offices', from: 'its records keep to the "agency_id" parents the caller reads', query: {}, scope: { parents: [{ field: { name: 'agency_id' } }] } }])
  })

  it('reads a list in no order of its own when it names none and its key is not sortable, as the app asks for it', () => {
    const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id)
    const found = readShapes({ models: [notes.toModel()], views: [view<typeof notes>('notes').list((r) => ({ columns: [r.body] })).toModel()], pages: [] })
    expect(found.find((shape) => shape.from === "the notes list's order")).toEqual({ resource: 'notes', request: 'GET /notes', from: "the notes list's order", query: {} })
  })

  it('reads a list that opens on a filter with that filter', () => {
    const opening = view<typeof places>('places').list((r) => ({ columns: [r.name], filter: 'country = "NL"' }))
    const found = readShapes({ models: [places.toModel()], views: [opening.toModel()], pages: [] })
    expect(found.find((shape) => shape.from === 'the places list as it opens')).toMatchObject({ request: 'GET /places?filter=country = "NL"&order_by=id asc', query: { filter: { kind: 'compare' } } })
  })
})
