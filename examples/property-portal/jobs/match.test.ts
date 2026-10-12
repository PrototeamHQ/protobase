import { describe, expect, it } from 'vitest'
import { distanceKm, matchesProfile, type ListingFacts, type ProfileCriteria } from './match'

const amsterdam = { latitude: 52.3676, longitude: 4.9041 }
const haarlem = { latitude: 52.3874, longitude: 4.6462 }
const utrecht = { latitude: 52.0907, longitude: 5.1214 }

// A three-room apartment for sale in Haarlem (place 2).
const listing: ListingFacts = {
  offer_type: 'sale', property_type: 'apartment', status: 'available', place_id: 2, ...haarlem,
  price: 450_000, living_area: 85, rooms: 3, energy_label: 'b',
}

// Anything for sale: every criterion empty.
const anything: ProfileCriteria = {
  offer_type: 'sale', place_id: null, centre: null, radius_km: 0, property_type: null,
  min_price: null, max_price: null, min_living_area: null, min_rooms: null, min_energy_label: null,
}

describe('distanceKm', () => {
  it('measures along the earth', () => {
    expect(distanceKm(amsterdam, haarlem)).toBeCloseTo(17.6, 0)
    expect(distanceKm(amsterdam, utrecht)).toBeCloseTo(34.2, 0)
    expect(distanceKm(amsterdam, amsterdam)).toBe(0)
  })
})

describe('matchesProfile', () => {
  it('matches a profile without criteria to every available listing of its offer', () => {
    expect(matchesProfile(anything, listing)).toBe(true)
    expect(matchesProfile({ ...anything, offer_type: 'rent' }, listing)).toBe(false)
    for (const status of ['under_offer', 'sold']) expect(matchesProfile(anything, { ...listing, status })).toBe(false)
  })

  it('keeps the price within its bounds, both inclusive', () => {
    expect(matchesProfile({ ...anything, min_price: 450_000, max_price: 450_000 }, listing)).toBe(true)
    expect(matchesProfile({ ...anything, max_price: 449_999 }, listing)).toBe(false)
    expect(matchesProfile({ ...anything, min_price: 450_001 }, listing)).toBe(false)
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
