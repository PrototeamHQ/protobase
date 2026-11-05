import { describe, expect, it } from 'vitest'
import type { Definition } from '@protobase/workflows'
import { definitionProblems } from './problems'

const withTrigger = (trigger: Definition['trigger']): Definition => ({ trigger, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Done', States: { Done: { Type: 'Succeed' } } } })

describe('definitionProblems', () => {
  it('refuses a record trigger without its resource, as a save does', () => {
    expect(definitionProblems(withTrigger({ 'app:record': {} }))).toEqual([{ field: 'trigger.app:record.resource', message: 'is missing' }])
    expect(definitionProblems(withTrigger({ 'app:record': { resource: 'deals' } }))).toEqual([])
  })

  it('refuses a trigger type the editor does not offer', () => {
    expect(definitionProblems(withTrigger({ 'app:schedule': { cron: '0 6 * * *' } })).map((problem) => problem.field)).toEqual(['trigger'])
  })

  it("leaves a type of the app's own plugins, which the editor does not list, to the server", () => {
    const shout = { Type: 'Task', Resource: 'example:shout', Arguments: { text: 'hi' }, End: true } as const
    const definition: Definition = {
      trigger: { 'acme:overdue': { days: 3 } },
      stateMachine: { QueryLanguage: 'JSONata', StartAt: 'Shout', States: { Shout: { ...shout, End: undefined, Next: 'Each' }, Each: { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { StartAt: 'Inner', States: { Inner: { ...shout, Resource: 'other:step' } } }, End: true } } },
    } as unknown as Definition
    expect(definitionProblems(definition)).toEqual([])
    const unknownBuiltIn = { ...definition, stateMachine: { ...definition.stateMachine, States: { Shout: { ...shout, Resource: 'app:nope' } }, StartAt: 'Shout' } } as unknown as Definition
    expect(definitionProblems(unknownBuiltIn).map((problem) => [problem.state, problem.field])).toEqual([['Shout', 'Resource']])
  })

  it("refuses a record trigger's key that is not a list of names, as its input schema does", () => {
    expect(definitionProblems(withTrigger({ 'app:record': { resource: 'invoices', key: 'due_at' } }))).toEqual([{ field: 'trigger.app:record.key', message: 'is a list of names, separated by commas' }])
    expect(definitionProblems(withTrigger({ 'app:record': { resource: 'invoices', key: ['due_at'] } }))).toEqual([])
  })
})
