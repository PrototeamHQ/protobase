import { describe, expect, it } from 'vitest'
import { createCsvParser, detectDelimiter } from './csv-parser'

// The rows of a text fed in chunks of `size` characters, so every split point is tried.
const parse = (text: string, size = text.length) => {
  const parser = createCsvParser()
  const rows: string[][] = []
  for (let index = 0; index < text.length; index += size) rows.push(...parser.push(text.slice(index, index + size)))
  return [...rows, ...parser.end()]
}

describe('detectDelimiter', () => {
  it('takes the delimiter the header line uses most, outside quotes', () => {
    expect(detectDelimiter('name,email,city')).toBe(',')
    expect(detectDelimiter('name;"email, work";city')).toBe(';')
    expect(detectDelimiter('name\temail')).toBe('\t')
    expect(detectDelimiter('name')).toBe(',')
  })
})

describe('createCsvParser', () => {
  const text = 'name;note;amount\r\n"Acme; Inc";"said ""hi""\nthen left";1.234,50\r\nGlobex;;7\r\n'

  it('reads quoted fields with delimiters, quotes and line breaks inside', () => {
    expect(parse(text)).toEqual([
      ['name', 'note', 'amount'],
      ['Acme; Inc', 'said "hi"\nthen left', '1.234,50'],
      ['Globex', '', '7'],
    ])
  })

  it('gives the same rows wherever the chunks split the text', () => {
    for (const size of [1, 2, 3, 5, 8]) expect(parse(text, size)).toEqual(parse(text))
  })

  it('keeps a blank line as an empty row, so rows keep their line numbers, and makes none for the last line break', () => {
    expect(parse('a,b\n1,2\n\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], [''], ['3', '4']])
  })

  it('drops a byte order mark and reads a file without a final line break or of the header alone', () => {
    expect(parse('﻿a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parse('a,b')).toEqual([['a', 'b']])
    expect(parse('a\rb\r')).toEqual([['a'], ['b']])
  })
})
