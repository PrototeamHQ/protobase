import { describe, expect, it } from 'vitest'
import { createCsvParser } from './csv-chunks'

// The rows of a text fed in chunks of `size` characters, so every split point is tried.
const parse = (text: string, size = text.length) => {
  const parser = createCsvParser()
  const rows: string[][] = []
  for (let index = 0; index < text.length; index += size) rows.push(...parser.push(text.slice(index, index + size)))
  return [...rows, ...parser.end()]
}

// The rows of a text, checked to be the same for every chunk size up to 8.
const parseSplit = (text: string) => {
  const whole = parse(text)
  for (let size = 1; size <= 8; size++) expect(parse(text, size)).toEqual(whole)
  return whole
}

describe('createCsvParser', () => {
  const text = 'name;note;amount\r\n"Acme; Inc";"said ""hi""\nthen left";1.234,50\r\nGlobex;;7\r\n'

  it('reads quoted fields with delimiters, quotes and line breaks inside, wherever the chunks split the text', () => {
    expect(parseSplit(text)).toEqual([
      ['name', 'note', 'amount'],
      ['Acme; Inc', 'said "hi"\nthen left', '1.234,50'],
      ['Globex', '', '7'],
    ])
  })

  it('takes the delimiter the header line uses most, outside quotes, and a comma when it holds none', () => {
    expect(parseSplit('name,email,city\nAcme,a@b.c,Delft')[1]).toEqual(['Acme', 'a@b.c', 'Delft'])
    expect(parseSplit('name;"email, work";city\nAcme;a@b.c;Delft')[1]).toEqual(['Acme', 'a@b.c', 'Delft'])
    expect(parseSplit('name\temail\nAcme\ta@b.c')[1]).toEqual(['Acme', 'a@b.c'])
    expect(parseSplit('name\nAcme\nGlobex, Ltd')).toEqual([['name'], ['Acme'], ['Globex', ' Ltd']])
  })

  it('finds the header line past a line break inside quotes', () => {
    expect(parseSplit('"first\nname";city\nAcme;Delft')).toEqual([['first\nname', 'city'], ['Acme', 'Delft']])
  })

  it('keeps a blank line as an empty row, so rows keep their line numbers, and makes none for the last line break', () => {
    expect(parseSplit('a,b\n1,2\n\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], [''], ['3', '4']])
    expect(parseSplit('a;b\n1;2\n\n3\n')).toEqual([['a', 'b'], ['1', '2'], [''], ['3']])
    expect(parseSplit('a,b\n')).toEqual([['a', 'b']])
  })

  it('reads rows ended by CRLF, LF or CR, mixed in one file, also with a chunk ending between the CR and the LF', () => {
    const crlf = createCsvParser()
    expect([...crlf.push('a,b\r'), ...crlf.push('\n1,2\r'), ...crlf.push('\n3,4'), ...crlf.end()]).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
    expect(parseSplit('a\rb\r')).toEqual([['a'], ['b']])
    expect(parseSplit('a,b\n1,2\r\n3,4\r5,"x\r\ny"\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4'], ['5', 'x\r\ny']])
    expect(parseSplit('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('drops a byte order mark and reads a file without a final line break, of the header alone or empty', () => {
    expect(parseSplit('﻿a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseSplit('a,b')).toEqual([['a', 'b']])
    expect(parse('')).toEqual([])
  })
})
