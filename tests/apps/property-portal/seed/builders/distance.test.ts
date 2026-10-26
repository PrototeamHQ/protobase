import { describe, expect, it } from 'vitest'
import { distanceKm } from './distance'

const amsterdam = { latitude: 52.3676, longitude: 4.9041 }
const haarlem = { latitude: 52.3874, longitude: 4.6462 }
const utrecht = { latitude: 52.0907, longitude: 5.1214 }

describe('distanceKm', () => {
  it('measures along the earth', () => {
    expect(distanceKm(amsterdam, haarlem)).toBeCloseTo(17.6, 0)
    expect(distanceKm(amsterdam, utrecht)).toBeCloseTo(34.2, 0)
    expect(distanceKm(amsterdam, amsterdam)).toBe(0)
  })
})
