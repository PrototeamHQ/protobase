import { describe, expect, it } from 'vitest'
import { withSecondStep } from './second-step-redirect'

describe('withSecondStep', () => {
  it("adds the second step's methods to the page a callback sends the browser to", () => {
    expect(withSecondStep('http://localhost:5173/', ['totp', 'otp'])).toBe('http://localhost:5173/?second-step=totp%2Cotp')
    expect(withSecondStep('https://erp.example.com/invoices?status=open#top', ['otp'])).toBe('https://erp.example.com/invoices?status=open&second-step=otp#top')
  })

  it('keeps a path a path', () => {
    expect(withSecondStep('/invoices', ['totp'])).toBe('/invoices?second-step=totp')
  })
})
