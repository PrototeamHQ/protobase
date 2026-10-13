import { describe, expect, it } from 'vitest'
import { f, resource, view, type SearchesOfModel } from '@protobase/schema'
import { saveSearchErrors, searchesOfErrors, searchesOfFor } from './view-saved-search'

const listings = resource('listings')
  .table('listings')
  .fields({ id: f.integer(), address: f.text(), published_at: f.timestamp().filterable(), listed_on: f.date().filterable(), updated_at: f.timestamp() })
  .primaryKey((r) => r.id)
const searches = resource('searches')
  .table('searches')
  .fields({
    id: f.integer().readOnly(),
    user_id: f.text().readOnly(),
    name: f.text(),
    filter: f.text(),
    frequency: f.enum(['instant', 'daily']),
    seen_at: f.timestamp(),
    created_at: f.timestamp().readOnly(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
const shared = resource('shared').table('shared').fields({ id: f.integer(), filter: f.text() }).primaryKey((r) => r.id)

const models = { listings: listings.toModel(), searches: searches.toModel(), shared: shared.toModel() }
const of = (o: Partial<SearchesOfModel> = {}): SearchesOfModel => ({
  resource: 'listings',
  filter: 'filter',
  name: 'name',
  controls: ['frequency'],
  unseen: { seenAt: 'seen_at', field: 'published_at' },
  ...o,
})

describe('searchesOfErrors', () => {
  it("takes the user's own searches of a resource, new by a filterable timestamp or date", () => {
    expect(searchesOfErrors(of(), 'searches', models)).toEqual([])
    expect(searchesOfErrors(of({ unseen: { seenAt: 'seen_at', field: 'listed_on' } }), 'searches', models)).toEqual([])
  })

  it('names a resource that is not there, and searches nobody owns', () => {
    expect(searchesOfErrors(of({ resource: 'homes' }), 'searches', models)).toEqual(['unknown resource "homes"'])
    expect(searchesOfErrors(of({ name: undefined, controls: undefined, unseen: undefined }), 'shared', models)).toEqual(["shared has no owner, so its searches are not each user's own"])
  })

  it('wants the fields a save and a control write to be writable', () => {
    expect(searchesOfErrors(of({ controls: ['created_at'] }), 'searches', models)).toEqual(['control "created_at" is read-only, so a search cannot be saved or changed'])
    expect(searchesOfErrors(of({ unseen: { seenAt: 'created_at', field: 'published_at' } }), 'searches', models)).toEqual(['unseen.seenAt "created_at" is read-only, so a search cannot be saved or changed'])
  })

  it('wants a record to be new by a filterable timestamp or date of the searched resource', () => {
    expect(searchesOfErrors(of({ unseen: { seenAt: 'seen_at', field: 'opened_at' } }), 'searches', models)).toEqual(['unseen.field: unknown field "opened_at" on listings'])
    expect(searchesOfErrors(of({ unseen: { seenAt: 'seen_at', field: 'updated_at' } }), 'searches', models)).toEqual(['unseen.field "updated_at" on listings is not a filterable timestamp or date'])
    expect(searchesOfErrors(of({ unseen: { seenAt: 'seen_at', field: 'address' } }), 'searches', models)).toEqual(['unseen.field "address" on listings is not a filterable timestamp or date'])
  })
})

describe('saveSearchErrors', () => {
  const listed = view<typeof searches>('searches').searchesOf((r) => ({ resource: 'listings', filter: r.filter })).toModel()
  it('wants a view that lists the saved searches of the resource', () => {
    expect(saveSearchErrors({ resource: 'searches' }, 'listings', models, [listed])).toEqual([])
    expect(saveSearchErrors({ resource: 'searches' }, 'listings', models, [])).toEqual(['no view of searches has searchesOf("listings"), so a saved search would be listed nowhere'])
    expect(saveSearchErrors({ resource: 'saved' }, 'listings', models, [listed])).toEqual(['unknown resource "saved"'])
  })
})

describe('searchesOfFor', () => {
  const readOnly = (model: typeof models.searches, names: string[]) => ({ ...model, fields: Object.fromEntries(Object.entries(model.fields).map(([name, field]) => [name, names.includes(name) ? { ...field, readOnly: true } : field])) })

  it('keeps what the caller can read and write', () => {
    expect(searchesOfFor(of(), 'searches', models)).toEqual(of())
  })

  it('goes without the searched resource or the filter', () => {
    expect(searchesOfFor(of(), 'searches', { searches: models.searches })).toBeUndefined()
    const { filter: _filter, ...fields } = models.searches.fields
    expect(searchesOfFor(of(), 'searches', { ...models, searches: { ...models.searches, fields } })).toBeUndefined()
  })

  it('leaves out the name, controls and unseen records the caller cannot write', () => {
    const narrowed = { ...models, searches: readOnly(models.searches, ['name', 'frequency', 'seen_at']) }
    expect(searchesOfFor(of(), 'searches', narrowed)).toEqual({ resource: 'listings', filter: 'filter' })
  })
})
