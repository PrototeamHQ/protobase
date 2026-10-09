import { describe, expect, it } from 'vitest'
import { fieldLabel } from './field'

describe('fieldLabel', () => {
  it("prefers the view's label", () => {
    expect(fieldLabel('companyId.city', 'Town')).toBe('Town')
  })

  it('puts the path in words, through relations', () => {
    expect([fieldLabel('total', undefined), fieldLabel('companyId.city', undefined), fieldLabel('plan.seatsUsed', undefined)]).toEqual(['Total', 'Company city', 'Plan seats used'])
  })
})
