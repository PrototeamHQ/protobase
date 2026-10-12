import { describe, expect, it } from 'vitest'
import { f, resource, type CardPhotosModel } from '@protobase/schema'
import { cardPhotosErrors } from './view-card-photos'

const listings = resource('listings').table('listings').fields({ id: f.integer(), address: f.text() }).primaryKey((r) => r.id)
const listingPhotos = resource('listing_photos')
  .table('listing_photos')
  .fields({
    id: f.integer(),
    listing_id: f.relation('listings').filterable(),
    agency_id: f.relation('agencies').filterable(),
    position: f.integer().sortable(),
    photo: f.file().accept(['image/*']),
    caption: f.text(),
    unfiltered_id: f.relation('listings'),
  })
  .primaryKey((r) => r.id)
const visits = resource('visits').table('visits').fields({ listing_id: f.integer(), day: f.date() }).primaryKey((r) => [r.listing_id, r.day])

const models = { listings: listings.toModel(), listing_photos: listingPhotos.toModel(), visits: visits.toModel() }
const photos = (o: Partial<CardPhotosModel> = {}): CardPhotosModel => ({ resource: 'listing_photos', field: 'listing_id', image: 'photo', sort: 'position', ...o })

describe('cardPhotosErrors', () => {
  it('takes photos whose relation points at the card, filterable, with a file field and a sort the resource allows', () => {
    expect(cardPhotosErrors(photos(), 'listings', models)).toEqual([])
    expect(cardPhotosErrors(photos({ sort: undefined }), 'listings', models)).toEqual([])
  })

  it('names a resource that is not there, on either side', () => {
    expect(cardPhotosErrors(photos({ resource: 'pictures' }), 'listings', models)).toEqual(['unknown resource "pictures"'])
    expect(cardPhotosErrors(photos(), 'homes', models)).toEqual(['unknown resource "homes"'])
  })

  it('needs a card record with a single-column key to match', () => {
    expect(cardPhotosErrors(photos(), 'visits', models)).toEqual(['visits has a composite key, so its cards cannot match photos'])
  })

  it('wants the field to be a filterable relation to the card resource', () => {
    expect(cardPhotosErrors(photos({ field: 'listing' }), 'listings', models)).toEqual(['unknown field "listing" on listing_photos'])
    expect(cardPhotosErrors(photos({ field: 'unfiltered_id' }), 'listings', models)).toEqual(['"unfiltered_id" on listing_photos is not filterable'])
    expect(cardPhotosErrors(photos({ field: 'agency_id' }), 'listings', models)).toEqual(['"agency_id" on listing_photos is not a relation to listings'])
  })

  it('wants the image to be a file field', () => {
    expect(cardPhotosErrors(photos({ image: 'picture' }), 'listings', models)).toEqual(['unknown field "picture" on listing_photos'])
    expect(cardPhotosErrors(photos({ image: 'caption' }), 'listings', models)).toEqual(['"caption" on listing_photos is not a file field'])
  })

  it('checks the sort against the photos resource', () => {
    expect(cardPhotosErrors(photos({ sort: 'caption' }), 'listings', models)).toHaveLength(1)
    expect(cardPhotosErrors(photos({ sort: 'caption' }), 'listings', models)[0]).toMatch(/^sort: /)
    expect(cardPhotosErrors(photos({ sort: 'position desc,' }), 'listings', models)[0]).toMatch(/^sort: /)
  })
})
