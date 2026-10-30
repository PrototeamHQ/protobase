import { describe, expect, it } from 'vitest'
import { createLineBreakNormalizer } from './line-breaks'

// The text normalized in chunks of `size` characters, checked to be the same for every chunk size up to 6.
const normalize = (text: string, delimiter = ',') => {
  const at = (size: number) => {
    const normalizer = createLineBreakNormalizer(delimiter)
    let out = ''
    for (let index = 0; index < text.length; index += size) out += normalizer.push(text.slice(index, index + size))
    return out
  }
  const whole = at(text.length)
  for (let size = 1; size <= 6; size++) expect(at(size)).toBe(whole)
  return whole
}

describe('createLineBreakNormalizer', () => {
  it('turns CR, LF and CRLF between rows, mixed in one file, into LF', () => {
    expect(normalize('a,b\r\n1,2\r3,4\n5,6\r\n')).toBe('a,b\n1,2\n3,4\n5,6\n')
  })

  it('keeps blank lines, one LF for each line break', () => {
    expect(normalize('a\r\n\r\nb\r\rc')).toBe('a\n\nb\n\nc')
  })

  it('leaves line breaks inside quoted fields as they are, also past a "" pair', () => {
    expect(normalize('"x\r\ny";"say ""hi""\r";z\r\n', ';')).toBe('"x\r\ny";"say ""hi""\r";z\n')
  })

  it('reads a quote in the middle of a field as text, as papaparse does', () => {
    expect(normalize('item,size\r\npipe,12" long\r\nnut,3"\r\n')).toBe('item,size\npipe,12" long\nnut,3"\n')
  })

  it('opens a quoted field only right after the delimiter, not after another character', () => {
    expect(normalize('a;b,"c\r\nd\r\n', ';')).toBe('a;b,"c\nd\n')
  })
})
