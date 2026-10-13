import type { Db } from '../../db/connection'
import type { StoredPhoto } from '../photos/library'
import { copyRows } from '../copy'
import { iso, row } from '../format'
import type { World } from '../world'

function* placeRows(world: World) {
  for (const [index, place] of world.places.entries()) yield row(index + 1, place.name, place.region, place.country, place.latitude.toFixed(6), place.longitude.toFixed(6))
}

function* agencyRows(world: World) {
  for (const agency of world.agencies) yield row(agency.id, agency.name, agency.placeId, agency.phone, agency.email, agency.website, iso(Date.UTC(2024, 0, 1)), iso(Date.UTC(2024, 0, 1)))
}

type Photos = ReadonlyMap<string, StoredPhoto>

// The library's stored value and placeholder of a photo the world names by its plain URI.
const storedPhoto = (photos: Photos, uri: string) => {
  const stored = photos.get(uri)
  if (!stored) throw new Error(`The photo library has no ${uri}`)
  return stored
}

function* listingRows(world: World, photos: Photos) {
  for (const l of world.listings) {
    const photo = storedPhoto(photos, l.photo)
    yield row(
      l.id, l.agencyId, l.placeId, l.propertyType, l.status, l.address, l.postalCode, l.latitude.toFixed(6), l.longitude.toFixed(6),
      l.purchasePrice?.toFixed(2), l.rentPrice?.toFixed(2), l.livingArea, l.plotArea, l.rooms, l.bedrooms, l.bathrooms, l.builtYear, l.energyLabel, l.garden, l.balcony, l.parking,
      l.description, photo.value, photo.placeholder, l.agentName, l.agentPhone, l.publishedAt === null ? null : iso(l.publishedAt), iso(l.createdAt), iso(l.publishedAt ?? l.createdAt),
    )
  }
}

function* photoRows(world: World, photos: Photos) {
  for (const listing of world.listings) {
    for (const photo of listing.photos) {
      const stored = storedPhoto(photos, photo.photo)
      yield row(listing.id, photo.position, stored.value, stored.placeholder, photo.caption)
    }
  }
}

/** The market's rows, each photo as the library stored it. */
export const seedMarket = async (sql: Db, world: World, photos: Photos) => {
  await copyRows(sql, 'market.places (id, name, region, country, latitude, longitude)', placeRows(world))
  await copyRows(sql, 'market.agencies (id, name, place_id, phone, email, website, created_at, updated_at)', agencyRows(world))
  await copyRows(
    sql,
    'market.listings (id, agency_id, place_id, property_type, status, address, postal_code, latitude, longitude, purchase_price, rent_price, living_area, plot_area, rooms, bedrooms, bathrooms, built_year, energy_label, garden, balcony, parking, description, photo, photo_placeholder, agent_name, agent_phone, published_at, created_at, updated_at)',
    listingRows(world, photos),
  )
  await copyRows(sql, 'market.listing_photos (listing_id, position, photo, photo_placeholder, caption)', photoRows(world, photos))
}
