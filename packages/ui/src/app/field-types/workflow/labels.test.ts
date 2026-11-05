import { describe, expect, it } from 'vitest'
import { stepTypeLabel, triggerLabel, triggerTypeLabel } from './labels'

describe('type labels', () => {
  it("names a built-in type by its own label, and a plugin's by the label the type list gives, else by its id", () => {
    expect(triggerLabel({ 'app:record': { resource: 'invoices' } })).toBe('Record ready')
    expect(triggerLabel({ 'acme:overdue': { days: 3 } })).toBe('acme:overdue')
    expect(triggerTypeLabel('acme:overdue', 'Overdue invoice')).toBe('Overdue invoice')
    expect(triggerLabel(undefined)).toBe('Choose a trigger')
    expect(stepTypeLabel('app:http', 'HTTP request (listed)')).toBe('HTTP request')
    expect(stepTypeLabel('acme:shout', 'Shout')).toBe('Shout')
    expect(stepTypeLabel('acme:shout')).toBe('acme:shout')
  })
})
