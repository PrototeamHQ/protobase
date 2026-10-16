import { describe, expect, it } from 'vitest'
import { createCsvParser } from './csv-parser'
import { failedRowsCsv } from './failed-rows'

describe('failedRowsCsv', () => {
  it('writes the file\'s columns, the line and the problems of each row, in line order, as CSV that reads back the same', () => {
    const text = failedRowsCsv(['Name', 'Amount'], [
      { line: 9, cells: ['Globex', null], problems: ['Amount: is empty, and it is required'] },
      { line: 3, cells: ['Acme, "the" first', 12.5], problems: ['Name: taken', 'Amount: too high'] },
    ])
    expect(text.startsWith('﻿')).toBe(true)
    const parser = createCsvParser()
    expect([...parser.push(text), ...parser.end()]).toEqual([
      ['Name', 'Amount', 'Line', 'Problems'],
      ['Acme, "the" first', '12.5', '3', 'Name: taken; Amount: too high'],
      ['Globex', '', '9', 'Amount: is empty, and it is required'],
    ])
  })
})
