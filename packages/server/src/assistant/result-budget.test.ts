import { describe, expect, it } from 'vitest'
import { budgetedJson, forcedJson, leadingFit } from './result-budget'

const long = (length: number) => 'x'.repeat(length)

describe('budgetedJson', () => {
  it('leaves a result within the budget as it is', () => {
    expect(budgetedJson({ record: { body: long(50) } }, 'note', 1000)).toBe(JSON.stringify({ record: { body: long(50) } }))
  })

  it('cuts long strings as little as fits, naming each cut with its full length', () => {
    const json = budgetedJson({ record: { body: long(5000), tags: [long(3000)], id: 1 }, etag: long(600) }, 'read the rest', 3000, 100)!
    expect(json.length).toBeLessThanOrEqual(3000)
    const result = JSON.parse(json)
    expect(result.cut_fields).toEqual([{ field: 'record.body', length: 5000 }, { field: 'record.tags[0]', length: 3000 }])
    expect(result.note).toBe('read the rest')
    expect(result.etag).toBe(long(600))
    expect(result.record.id).toBe(1)
    expect(result.record.body).toMatch(/^x+…$/)
    expect(result.record.body.length).toBeGreaterThan(900)
  })

  it('gives up when strings at the floor still do not fit', () => {
    expect(budgetedJson({ items: Array.from({ length: 20 }, () => ({ body: long(1000) })) }, 'note', 3000, 500)).toBeUndefined()
  })
})

describe('forcedJson', () => {
  it('cuts below the floor when it must', () => {
    const json = forcedJson({ items: Array.from({ length: 20 }, () => ({ body: long(1000) })) }, 'n', 3000)
    expect(json.length).toBeLessThanOrEqual(3000)
    expect(JSON.parse(json).cut_fields).toHaveLength(20)
  })
})

describe('leadingFit', () => {
  it('finds the most items that fit, at least one', () => {
    expect(leadingFit(10, (count) => count <= 6)).toBe(6)
    expect(leadingFit(10, () => true)).toBe(10)
    expect(leadingFit(10, () => false)).toBe(1)
  })
})
