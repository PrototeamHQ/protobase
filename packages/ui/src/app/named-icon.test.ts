import { Ban, Bath, Bed, KeyRound, MemoryStick, Power, RotateCw, RulerDimensionLine, Send, Square } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { actionIcon } from './action-icon'
import { namedIcon } from './named-icon'

describe('namedIcon', () => {
  it('finds the icons actions and fields name, and nothing for another name', () => {
    expect(namedIcon('ruler')).toBe(RulerDimensionLine)
    expect(namedIcon('send')).toBe(Send)
    expect(namedIcon('bed')).toBe(Bed)
    expect(namedIcon('bath')).toBe(Bath)
    expect(namedIcon('key')).toBe(KeyRound)
    expect(namedIcon('ban')).toBe(Ban)
    expect(namedIcon('toString')).toBeUndefined()
    expect(namedIcon(undefined)).toBeUndefined()
  })

  it('finds the icons a VM manager names by what they do', () => {
    expect(namedIcon('stop')).toBe(Square)
    expect(namedIcon('power')).toBe(Power)
    expect(namedIcon('restart')).toBe(RotateCw)
    expect(namedIcon('memory')).toBe(MemoryStick)
  })

  it('gives an action the same icon, and its default for an unknown name', () => {
    expect(actionIcon('ruler')).toBe(RulerDimensionLine)
    expect(actionIcon('unknown')).not.toBeUndefined()
  })
})
