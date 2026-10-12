import type { Db } from '../../db/connection'
import { copyRows } from '../copy'
import { iso, row } from '../format'
import type { World } from '../world'

function* placeRows(world: World) {
  for (const [index, place] of world.places.entries()) yield row(index + 1, place.name, place.region, place.country, place.latitude.toFixed(6), place.longitude.toFixed(6))
}

function* agencyRows(world: World) {
  for (const agency of world.agencies) yield row(agency.id, agency.name, agency.placeId, agency.phone, agency.email, agency.website, iso(Date.UTC(2024, 0, 1)), iso(Date.UTC(2024, 0, 1)))
}

function* listingRows(world: World) {
  for (const l of world.listings) {
    yield row(
      l.id, l.agencyId, l.placeId, l.propertyType, l.status, l.address, l.postalCode, l.latitude.toFixed(6), l.longitude.toFixed(6),
      l.purchasePrice?.toFixed(2), l.rentPrice?.toFixed(2), l.livingArea, l.plotArea, l.rooms, l.bedrooms, l.bathrooms, l.builtYear, l.energyLabel, l.garden, l.balcony, l.parking,
      l.description, l.photo, l.agentName, l.agentPhone, l.publishedAt === null ? null : iso(l.publishedAt), iso(l.createdAt), iso(l.publishedAt ?? l.createdAt),
    )
  }
}

function* photoRows(world: World) {
  for (const listing of world.listings) for (const photo of listing.photos) yield row(listing.id, photo.position, photo.photo, photo.caption)
}

export const seedMarket = async (sql: Db, world: World) => {
  await copyRows(sql, 'market.places (id, name, region, country, latitude, longitude)', placeRows(world))
  await copyRows(sql, 'market.agencies (id, name, place_id, phone, email, website, created_at, updated_at)', agencyRows(world))
  await copyRows(
    sql,
    'market.listings (id, agency_id, place_id, property_type, status, address, postal_code, latitude, longitude, purchase_price, rent_price, living_area, plot_area, rooms, bedrooms, bathrooms, built_year, energy_label, garden, balcony, parking, description, photo, agent_name, agent_phone, published_at, created_at, updated_at)',
    listingRows(world),
  )
  await copyRows(sql, 'market.listing_photos (listing_id, position, photo, caption)', photoRows(world))
}
