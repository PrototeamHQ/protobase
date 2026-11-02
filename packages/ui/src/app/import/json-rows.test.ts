import { describe, expect, it } from 'vitest'
import { jsonRows } from './json-rows'

const read = (content: string | Uint8Array<ArrayBuffer>) => jsonRows(new File([content], 'rows.json'))

describe('JSON rows', () => {
  it('makes the keys of all objects the columns, in first-seen order, and a missing key an empty cell', async () => {
    expect(await read('[{"name":"Acme","city":"Delft"},{"name":"Beta","email":"b@example.com"},{"city":null}]')).toEqual([
      { line: 1, cells: ['name', 'city', 'email'] },
      { line: 2, cells: ['Acme', 'Delft', null] },
      { line: 3, cells: ['Beta', null, 'b@example.com'] },
      { line: 4, cells: [null, null, null] },
    ])
  })

  it('keeps numbers, booleans and text as the file states them', async () => {
    expect(await read('[{"code":"007","count":7,"price":1.5,"active":false}]')).toEqual([
      { line: 1, cells: ['code', 'count', 'price', 'active'] },
      { line: 2, cells: ['007', 7, 1.5, false] },
    ])
  })

  it('keeps the digits of a whole number past what a JavaScript number holds exactly', async () => {
    const [, row] = await read('[{"id":12345678901234567890,"small":9007199254740991}]')
    expect(row!.cells).toEqual(['12345678901234567890', 9007199254740991])
  })

  it('keeps nested objects and arrays as JSON values', async () => {
    const [, row] = await read('[{"address":{"city":"Delft"},"tags":["a","b"]}]')
    expect(row!.cells).toEqual([{ json: { city: 'Delft' } }, { json: ['a', 'b'] }])
  })

  it('reads an empty list as a file without columns or rows', async () => {
    expect(await read('[]')).toEqual([{ line: 1, cells: [] }])
  })

  it('refuses a file that is not a list of objects', async () => {
    await expect(read('{"name":"Acme"}')).rejects.toThrow('The JSON file does not hold a list of objects')
    await expect(read('42')).rejects.toThrow('The JSON file does not hold a list of objects')
    await expect(read('[{"name":"Acme"},["Beta"]]')).rejects.toThrow('The JSON file does not hold a list of objects')
    await expect(read('[{"name":"Acme"},null]')).rejects.toThrow('The JSON file does not hold a list of objects')
  })

  it('refuses invalid JSON and text that is not UTF-8', async () => {
    await expect(read('[{"name":')).rejects.toThrow('The file is not valid JSON in UTF-8 text')
    await expect(read(new Uint8Array([0x5b, 0x22, 0xe9, 0x22, 0x5d]))).rejects.toThrow('The file is not valid JSON in UTF-8 text')
  })
})
