import { Bed, RulerDimensionLine, Send } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { actionIcon } from './action-icon'
import { namedIcon } from './named-icon'

describe('namedIcon', () => {
  it('finds the icons actions and fields name, and nothing for another name', () => {
    expect(namedIcon('ruler')).toBe(RulerDimensionLine)
    expect(namedIcon('send')).toBe(Send)
    expect(namedIcon('bed')).toBe(Bed)
    expect(namedIcon('toString')).toBeUndefined()
    expect(namedIcon(undefined)).toBeUndefined()
  })

  it('gives an action the same icon, and its default for an unknown name', () => {
    expect(actionIcon('ruler')).toBe(RulerDimensionLine)
    expect(actionIcon('unknown')).not.toBeUndefined()
  })
})
