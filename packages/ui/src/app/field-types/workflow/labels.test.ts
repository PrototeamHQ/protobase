import { describe, expect, it } from 'vitest'
import type { WorkflowTypeList } from '@protobase/client'
import { stateLabel, stepTypeLabel, triggerLabel, triggerTypeLabel } from './labels'

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

  it('names a state and a trigger by the label the type list gives, a built-in by its own', () => {
    const entry = (id: string, label: string) => ({ id, kind: 'step', label, description: '', input: {}, available: true })
    const types: WorkflowTypeList = { step_types: [entry('acme:shout', 'Shout'), entry('app:http', 'HTTP (listed)')], triggers: [entry('acme:overdue', 'Overdue invoice')] }
    expect(stateLabel({ Type: 'Task', Resource: 'acme:shout', End: true }, types)).toBe('Shout')
    expect(stateLabel({ Type: 'Task', Resource: 'app:http', End: true }, types)).toBe('HTTP request')
    expect(stateLabel({ Type: 'Task', Resource: 'acme:gone', End: true }, types)).toBe('acme:gone')
    expect(stateLabel({ Type: 'Pass', End: true }, types)).toBe('Set values')
    expect(triggerLabel({ 'acme:overdue': {} }, types)).toBe('Overdue invoice')
  })
})
