import { describe, expect, it } from 'vitest'
import { otherTriggerType, triggerLabel } from './labels'

describe('trigger labels', () => {
  it("names a trigger of the app's own plugins by its type, and an offered one by its kind", () => {
    expect(otherTriggerType({ 'acme:overdue': { days: 3 } })).toBe('acme:overdue')
    expect(triggerLabel({ 'acme:overdue': { days: 3 } })).toBe('acme:overdue')
    expect(otherTriggerType({ 'app:record': { resource: 'invoices' } })).toBeUndefined()
    expect(triggerLabel({ 'app:record': { resource: 'invoices' } })).toBe('Record ready')
    expect(triggerLabel(undefined)).toBe('Choose a trigger')
  })
})
