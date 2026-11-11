import { describe, expect, it } from 'vitest'
import { imageQuery } from './image-query'

describe('imageQuery', () => {
  it('asks for the size the block names, in its theme', () => {
    expect(imageQuery({ width: 320, height: 240, space: 900, theme: 'dark' })).toEqual({ width: '320', height: '240', theme: 'dark' })
  })

  it('asks for the space the block has, rounded up to a step, and names no height it lacks', () => {
    expect(imageQuery({ space: 612.5, theme: 'light' })).toEqual({ width: '700', theme: 'light' })
  })

  it('asks for nothing before the space is measured', () => {
    expect(imageQuery({ space: 0, theme: 'light' })).toBeUndefined()
  })
})
