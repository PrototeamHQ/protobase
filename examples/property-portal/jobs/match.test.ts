import { describe, expect, it } from 'vitest'
import { distanceKm, matchesProfile, type ListingFacts, type ProfileCriteria } from './match'

const amsterdam = { latitude: 52.3676, longitude: 4.9041 }
const haarlem = { latitude: 52.3874, longitude: 4.6462 }
const utrecht = { latitude: 52.0907, longitude: 5.1214 }

// A three-room apartment for sale in Haarlem (place 2).
const listing: ListingFacts = {
  property_type: 'apartment', status: 'available', place_id: 2, ...haarlem,
  purchase_price: 450_000, rent_price: null, living_area: 85, rooms: 3, energy_label: 'b',
}

// Anything to buy: every criterion empty.
const anything: ProfileCriteria = {
  for_sale: true, for_rent: false, place_id: null, centre: null, radius_km: 0, property_type: null,
  min_purchase_price: null, max_purchase_price: null, min_rent_price: null, max_rent_price: null, min_living_area: null, min_rooms: null, min_energy_label: null,
}
const toRent: ProfileCriteria = { ...anything, for_sale: false, for_rent: true }
// The same flat, let in the meantime.
const both: ListingFacts = { ...listing, rent_price: 1_450 }

describe('distanceKm', () => {
  it('measures along the earth', () => {
    expect(distanceKm(amsterdam, haarlem)).toBeCloseTo(17.6, 0)
    expect(distanceKm(amsterdam, utrecht)).toBeCloseTo(34.2, 0)
    expect(distanceKm(amsterdam, amsterdam)).toBe(0)
  })
})

describe('matchesProfile', () => {
  it('matches a profile without criteria to every available listing offered the way it looks', () => {
    expect(matchesProfile(anything, listing)).toBe(true)
    expect(matchesProfile(toRent, listing)).toBe(false)
    expect(matchesProfile(toRent, { ...listing, purchase_price: null, rent_price: 1_450 })).toBe(true)
    expect(matchesProfile(anything, { ...listing, purchase_price: null, rent_price: 1_450 })).toBe(false)
    for (const status of ['under_offer', 'sold']) expect(matchesProfile(anything, { ...listing, status })).toBe(false)
  })

  it('keeps the purchase price within its bounds, both inclusive', () => {
    expect(matchesProfile({ ...anything, min_purchase_price: 450_000, max_purchase_price: 450_000 }, listing)).toBe(true)
    expect(matchesProfile({ ...anything, max_purchase_price: 449_999 }, listing)).toBe(false)
    expect(matchesProfile({ ...anything, min_purchase_price: 450_001 }, listing)).toBe(false)
  })

  it('keeps the rent within the rent range, apart from the purchase range', () => {
    expect(matchesProfile({ ...toRent, min_rent_price: 1_450, max_rent_price: 1_450, max_purchase_price: 1 }, both)).toBe(true)
    expect(matchesProfile({ ...toRent, max_rent_price: 1_449 }, both)).toBe(false)
    expect(matchesProfile({ ...toRent, min_rent_price: 1_451 }, both)).toBe(false)
  })

  it('fits a listing offered both ways to a profile looking either way, in either range', () => {
    expect(matchesProfile(anything, both)).toBe(true)
    expect(matchesProfile(toRent, both)).toBe(true)
    const either = { ...anything, for_rent: true, max_purchase_price: 400_000, max_rent_price: 1_500 }
    expect(matchesProfile(either, both)).toBe(true)
    expect(matchesProfile(either, listing)).toBe(false)
    expect(matchesProfile({ ...either, max_rent_price: 1_400 }, both)).toBe(false)
  })

  it('wants at least the living area and rooms, and the type when it names one', () => {
    expect(matchesProfile({ ...anything, min_living_area: 85, min_rooms: 3, property_type: 'apartment' }, listing)).toBe(true)
    expect(matchesProfile({ ...anything, min_living_area: 86 }, listing)).toBe(false)
    expect(matchesProfile({ ...anything, min_rooms: 4 }, listing)).toBe(false)
    expect(matchesProfile({ ...anything, property_type: 'house' }, listing)).toBe(false)
  })

  it('takes the minimum energy label or a better one, and no pending label', () => {
    expect(matchesProfile({ ...anything, min_energy_label: 'b' }, listing)).toBe(true)
    expect(matchesProfile({ ...anything, min_energy_label: 'c' }, listing)).toBe(true)
    expect(matchesProfile({ ...anything, min_energy_label: 'a' }, listing)).toBe(false)
    expect(matchesProfile({ ...anything, min_energy_label: 'a_plus' }, { ...listing, energy_label: 'a_plus_4' })).toBe(true)
    expect(matchesProfile({ ...anything, min_energy_label: 'g' }, { ...listing, energy_label: null })).toBe(false)
  })

  it('finds the listing in its place, or within the radius around another place', () => {
    expect(matchesProfile({ ...anything, place_id: 2, centre: haarlem }, listing)).toBe(true)
    expect(matchesProfile({ ...anything, place_id: 1, centre: amsterdam }, listing)).toBe(false)
    expect(matchesProfile({ ...anything, place_id: 1, centre: amsterdam, radius_km: 20 }, listing)).toBe(true)
    expect(matchesProfile({ ...anything, place_id: 1, centre: amsterdam, radius_km: 15 }, listing)).toBe(false)
    expect(matchesProfile({ ...anything, place_id: 3, centre: utrecht, radius_km: 40 }, listing)).toBe(false)
  })
})
