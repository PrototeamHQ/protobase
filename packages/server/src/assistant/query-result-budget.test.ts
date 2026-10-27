import { describe, expect, it } from 'vitest'
import { budgetedQueryResult } from './query-result-budget'
import { resultBudget } from './result-budget'

const readOn = (count: number) => `; add OFFSET ${count}`

describe('budgetedQueryResult', () => {
  it('returns a small result as it is', () => {
    const result = { columns: ['id'], rows: [[1]], truncated: false }
    expect(JSON.parse(budgetedQueryResult(result, readOn))).toEqual(result)
  })

  it('cuts long values to valid JSON within the budget', () => {
    const json = budgetedQueryResult({ columns: ['id', 'body'], rows: [[1, 'é"\n'.repeat(30_000)]], truncated: false }, readOn)
    expect(json.length).toBeLessThanOrEqual(resultBudget)
    expect(JSON.parse(json).cut_fields).toEqual([{ field: 'rows[0][1]', length: 90_000 }])
  })

  it('returns fewer rows, marked truncated, when cut values still do not fit', () => {
    const rows = Array.from({ length: 200 }, (_, index) => [index, 'x'.repeat(2000)])
    const json = budgetedQueryResult({ columns: ['id', 'body'], rows, truncated: false }, readOn)
    expect(json.length).toBeLessThanOrEqual(resultBudget)
    const result = JSON.parse(json)
    expect(result.truncated).toBe(true)
    expect(result.rows.length).toBeGreaterThan(10)
    expect(result.rows.length).toBeLessThan(200)
    expect(result.note).toContain(`add OFFSET ${result.rows.length}`)
  })
})
