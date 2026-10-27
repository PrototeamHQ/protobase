import { describe, expect, it } from 'vitest'
import { humanize } from './humanize'

describe('humanize', () => {
  it.each([
    ['company_id', 'Company'],
    ['country_code', 'Country'],
    ['discount_percent', 'Discount percent'],
    ['stock_moves', 'Stock moves'],
    ['companyId', 'Company'],
    ['discountPercent', 'Discount percent'],
    ['status', 'Status'],
    ['id', 'Id'],
  ])('%s reads as "%s"', (name, label) => {
    expect(humanize(name)).toBe(label)
  })
})
