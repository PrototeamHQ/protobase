import { describe, expect, it } from 'vitest'
import { imageQuery, imageRefetch, isPicture } from './image-query'

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

describe('imageRefetch', () => {
  it('asks again every refresh seconds, never on window focus', () => {
    expect(imageRefetch(60)).toEqual({ staleTime: Infinity, refetchOnWindowFocus: false, refetchInterval: 60_000 })
  })

  it('asks once without refresh, and not again when the window regains focus', () => {
    expect(imageRefetch()).toEqual({ staleTime: Infinity, refetchOnWindowFocus: false })
  })
})

describe('isPicture', () => {
  it('takes an image of any type', () => {
    expect(isPicture(new Blob(['png'], { type: 'image/png' }))).toBe(true)
    expect(isPicture(new Blob(['<svg/>'], { type: 'image/svg+xml' }))).toBe(true)
  })

  it('refuses a file of another type, text and JSON', () => {
    expect(isPicture(new Blob(['%PDF'], { type: 'application/pdf' }))).toBe(false)
    expect(isPicture(new Blob(['bytes']))).toBe(false)
    expect(isPicture('a picture')).toBe(false)
    expect(isPicture({ url: '/map.png' })).toBe(false)
  })
})
