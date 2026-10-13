import { describe, expect, it } from 'vitest'
import { f, resource, type CardFavoriteModel } from '@protobase/schema'
import { cardFavoriteErrors, favoriteOwnerErrors } from './view-card-favorite'

const listings = resource('listings').table('listings').fields({ id: f.integer(), address: f.text() }).primaryKey((r) => r.id)
const favorites = resource('favorites')
  .table('favorites')
  .fields({
    id: f.integer().readOnly(),
    user_id: f.text().readOnly(),
    listing_id: f.relation('listings').filterable(),
    agency_id: f.relation('agencies').filterable(),
    fixed_id: f.relation('listings').filterable().readOnly(),
    unfiltered_id: f.relation('listings'),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
const shared = resource('shared').table('shared').fields({ id: f.integer(), listing_id: f.relation('listings').filterable() }).primaryKey((r) => r.id)
const visits = resource('visits').table('visits').fields({ listing_id: f.integer(), day: f.date() }).primaryKey((r) => [r.listing_id, r.day])

const models = { listings: listings.toModel(), favorites: favorites.toModel(), shared: shared.toModel(), visits: visits.toModel() }
const favorite = (o: Partial<CardFavoriteModel> = {}): CardFavoriteModel => ({ resource: 'favorites', field: 'listing_id', ...o })

describe('cardFavoriteErrors', () => {
  it('takes a writable, filterable relation to the card resource', () => {
    expect(cardFavoriteErrors(favorite(), 'listings', models)).toEqual([])
  })

  it('names a resource that is not there, on either side', () => {
    expect(cardFavoriteErrors(favorite({ resource: 'saved' }), 'listings', models)).toEqual(['unknown resource "saved"'])
    expect(cardFavoriteErrors(favorite(), 'homes', models)).toEqual(['unknown resource "homes"'])
  })

  it('needs a card record with a single-column key to save', () => {
    expect(cardFavoriteErrors(favorite(), 'visits', models)).toEqual(['visits has a composite key, so its cards cannot be saved'])
  })

  it('wants the field to be a filterable relation to the card resource that a press can write', () => {
    expect(cardFavoriteErrors(favorite({ field: 'listing' }), 'listings', models)).toEqual(['unknown field "listing" on favorites'])
    expect(cardFavoriteErrors(favorite({ field: 'unfiltered_id' }), 'listings', models)).toEqual(['"unfiltered_id" on favorites is not filterable'])
    expect(cardFavoriteErrors(favorite({ field: 'agency_id' }), 'listings', models)).toEqual(['"agency_id" on favorites is not a relation to listings'])
    expect(cardFavoriteErrors(favorite({ field: 'fixed_id' }), 'listings', models)).toEqual(['"fixed_id" on favorites is read-only, so a press cannot save the card'])
  })
})

describe('favoriteOwnerErrors', () => {
  it("wants the saved records to be each user's own", () => {
    expect(favoriteOwnerErrors(favorite(), models)).toEqual([])
    expect(favoriteOwnerErrors(favorite({ resource: 'shared' }), models)).toEqual(["shared has no owner, so its records are not each user's own"])
  })
})
