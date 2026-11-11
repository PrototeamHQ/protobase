import { describe, expect, it } from 'vitest'
import { edgeLook } from './edge-look'

describe('edgeLook', () => {
  const colors = { held: 'red', blocked: '#b91c1c' }

  it("fills the edge with a value's hex colour, or its tone's", () => {
    expect(edgeLook(colors, 'blocked')).toEqual({ style: { backgroundColor: '#b91c1c' } })
    expect(edgeLook(colors, 'held')).toEqual({ className: 'bg-danger' })
  })

  it('is neutral for a value without a colour, no value or no colours', () => {
    expect(edgeLook(colors, 'clear')).toEqual({ className: 'bg-faint-foreground' })
    expect(edgeLook(colors, null)).toEqual({ className: 'bg-faint-foreground' })
    expect(edgeLook(undefined, 'held')).toEqual({ className: 'bg-faint-foreground' })
  })
})
