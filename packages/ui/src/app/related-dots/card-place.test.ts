import { describe, expect, it } from 'vitest'
import { placeCard } from './card-place'

const viewport = { width: 800, height: 600 }
const card = { width: 280, height: 120 }

describe('placeCard', () => {
  it('puts the card below the dot, at its left edge', () => {
    expect(placeCard({ top: 100, bottom: 110, left: 200, width: 10 }, card, viewport)).toEqual({ top: 116, left: 200 })
  })

  it('puts it above the dot when there is no room below', () => {
    expect(placeCard({ top: 500, bottom: 510, left: 200, width: 10 }, card, viewport)).toEqual({ top: 374, left: 200 })
  })

  it('keeps it inside the viewport sides', () => {
    expect(placeCard({ top: 100, bottom: 110, left: 700, width: 10 }, card, viewport).left).toBe(514)
    expect(placeCard({ top: 100, bottom: 110, left: -20, width: 10 }, card, viewport).left).toBe(6)
  })
})
