import { describe, expect, it } from 'vitest'
import { recordPosition } from './record-position'

const fields = { latitude: 'lat', longitude: 'lng' }

describe('recordPosition', () => {
  it('reads degrees from numbers and from the text a decimal comes as', () => {
    expect(recordPosition({ lat: 52.370216, lng: 4.895168 }, fields)).toEqual({ latitude: 52.370216, longitude: 4.895168 })
    expect(recordPosition({ lat: '40.416775', lng: '-3.703790' }, fields)).toEqual({ latitude: 40.416775, longitude: -3.70379 })
    expect(recordPosition({ lat: '0', lng: 0 }, fields)).toEqual({ latitude: 0, longitude: 0 })
    expect(recordPosition({ lat: -90, lng: 180 }, fields)).toEqual({ latitude: -90, longitude: 180 })
  })

  it('has no position when a field is empty or holds no number', () => {
    expect(recordPosition({ lat: null, lng: 4.9 }, fields)).toBeUndefined()
    expect(recordPosition({ lat: 52.4 }, fields)).toBeUndefined()
    expect(recordPosition({ lat: ' ', lng: 4.9 }, fields)).toBeUndefined()
    expect(recordPosition({ lat: 'north', lng: 4.9 }, fields)).toBeUndefined()
    expect(recordPosition({ lat: true, lng: 4.9 }, fields)).toBeUndefined()
  })

  it('has no position off the globe', () => {
    expect(recordPosition({ lat: 90.5, lng: 4.9 }, fields)).toBeUndefined()
    expect(recordPosition({ lat: 52.4, lng: -180.1 }, fields)).toBeUndefined()
    expect(recordPosition({ lat: Number.POSITIVE_INFINITY, lng: 4.9 }, fields)).toBeUndefined()
  })
})
