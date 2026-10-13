import { describe, expect, it } from 'vitest'
import { checkedAccept, checkedProvider, checkedVariants, parseSize } from './file-options'

describe('file options', () => {
  it('read sizes in decimal and binary units', () => {
    expect(parseSize('10 MB')).toBe(10_000_000)
    expect(parseSize('512KiB')).toBe(524_288)
    expect(parseSize('1.5 gb')).toBe(1_500_000_000)
    expect(parseSize(2048)).toBe(2048)
    expect(() => parseSize('ten MB')).toThrow('is not a size')
    expect(() => parseSize('10 parsecs')).toThrow('is not a size')
    expect(() => parseSize(0)).toThrow('positive whole number')
  })

  it('take exact types and type/* wildcards, lowercased', () => {
    expect(checkedAccept(['image/*', 'Application/PDF', '*/*'])).toEqual(['image/*', 'application/pdf', '*/*'])
    expect(() => checkedAccept(['*'])).toThrow('"*" is not a media type')
    expect(() => checkedAccept(['image'])).toThrow('is not a media type')
    expect(() => checkedAccept(['*/png'])).toThrow('is not a media type')
  })

  it('name providers like URI schemes, never as one browsers already know', () => {
    expect(checkedProvider('private')).toBe('private')
    expect(checkedProvider('archive-2')).toBe('archive-2')
    expect(() => checkedProvider('Public')).toThrow('is not a file provider name')
    expect(() => checkedProvider('2fast')).toThrow('is not a file provider name')
    expect(() => checkedProvider('https')).toThrow('cannot name a file provider')
  })

  it('take image variants with snake_case names, known formats and fits, and bounds and qualities in range', () => {
    expect(checkedVariants({ card_2x: { width: 1280, format: 'webp', quality: 80 } })).toEqual({ card_2x: { width: 1280, format: 'webp', quality: 80 } })
    expect(() => checkedVariants({ Card: { format: 'webp' } })).toThrow('"Card" cannot name an image variant')
    expect(() => checkedVariants({ card: { format: 'gif' as never } })).toThrow('"gif" is not an image format')
    expect(() => checkedVariants({ card: { width: 640, fit: 'cover', format: 'webp' } })).toThrow('fit "cover" needs both a width and a height')
    expect(() => checkedVariants({ card: { width: 640, fit: 'fill' as never, format: 'webp' } })).toThrow('fit is "inside" or "cover"')
    expect(() => checkedVariants({ card: { width: 0, format: 'webp' } })).toThrow('width must be a whole number of pixels')
    expect(() => checkedVariants({ card: { height: 20_000, format: 'webp' } })).toThrow('height must be a whole number of pixels')
    expect(() => checkedVariants({ card: { format: 'jpeg', quality: 101 } })).toThrow('quality must be a whole number from 1 to 100')
  })
})
