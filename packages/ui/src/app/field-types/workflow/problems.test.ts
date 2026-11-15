import { describe, expect, it } from 'vitest'
import type { Definition, State } from '@protobase/workflows'
import { exampleWorkflowTypes } from '../../../../../../test-support/workflow-types'
import { definitionProblems } from './problems'

const withTrigger = (trigger: Definition['trigger']): Definition => ({ trigger, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } } })
const withStep = (step: Partial<State>): Definition => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Step', States: { Step: { Type: 'Task', End: true, ...step } as State } } })
const check = (definition: Definition) => definitionProblems(definition, exampleWorkflowTypes)

describe('definitionProblems', () => {
  it('refuses a record trigger without its resource, as a save does', () => {
    expect(check(withTrigger({ 'app:record': {} }))).toEqual([{ field: 'trigger.app:record.resource', message: 'is missing' }])
    expect(check(withTrigger({ 'app:record': { resource: 'deals' } }))).toEqual([])
  })

  it("refuses a plugin's trigger or step without an input it requires, naming the node and the input", () => {
    expect(check(withTrigger({ 'acme:overdue': {} } as Definition['trigger']))).toEqual([{ field: 'trigger.acme:overdue.days', message: 'is missing' }])
    expect(check(withTrigger({ 'acme:overdue': { days: 3 } } as Definition['trigger']))).toEqual([])
    expect(check(withStep({ Resource: 'acme:shout', Arguments: {} }))).toEqual([{ state: 'Step', field: 'Arguments.text', message: 'is missing; acme:shout needs it' }])
    expect(check(withStep({ Resource: 'acme:shout', Arguments: { text: 'hi' } }))).toEqual([])
  })

  it('refuses a type the app does not have', () => {
    expect(check(withTrigger({ 'other:trigger': {} } as Definition['trigger'])).map((problem) => problem.field)).toEqual(['trigger'])
    expect(check(withStep({ Resource: 'other:step' })).map((problem) => [problem.state, problem.field])).toEqual([['Step', 'Resource']])
  })

  it('refuses a custom step without a version naming its latest, as a save does', () => {
    const step = (version: number) => ({ id: `custom:invoice_pdf:${version}`, kind: 'step', plugin: 'custom', label: 'Invoice PDF', description: '', input: { type: 'object' }, available: true })
    const types = { ...exampleWorkflowTypes, step_types: [...exampleWorkflowTypes.step_types, step(1), step(2)] }
    expect(definitionProblems(withStep({ Resource: 'custom:invoice_pdf' }), types)).toEqual([{ state: 'Step', field: 'Resource', message: '"custom:invoice_pdf" names no version: write custom:invoice_pdf:2' }])
    expect(definitionProblems(withStep({ Resource: 'custom:invoice_pdf:1' }), types)).toEqual([])
  })

  it('refuses a type the list marks not available, with its reason', () => {
    expect(check(withTrigger({ 'acme:inbox': {} } as Definition['trigger']))).toEqual([{ field: 'trigger', message: '"acme:inbox" cannot run in this app: It signs in through acme:mail, whose OAuth client this app does not set in auth.connections' }])
  })

  it("refuses a record trigger's key that is not a list of names, as its input schema does", () => {
    expect(check(withTrigger({ 'app:record': { resource: 'invoices', key: 'due_at' } }))).toEqual([{ field: 'trigger.app:record.key', message: 'is a list of names, separated by commas' }])
    expect(check(withTrigger({ 'app:record': { resource: 'invoices', key: ['due_at'] } }))).toEqual([])
  })
})
