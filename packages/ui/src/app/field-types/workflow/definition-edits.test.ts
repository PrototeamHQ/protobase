import { describe, expect, it } from 'vitest'
import { checkDefinition } from '@protobase/workflows'
import { ticketsWorkflow } from '../../testing/workflow-fixtures'
import { emptyDefinition } from './definition'
import { addState, addStateAfter, addStateFirst, connect, disconnect, freeName, placeAfter, removeState, renameState, startAt } from './definition-edits'

describe('workflow edits', () => {
  it('adds a first state, which the workflow starts at, and later ones not yet connected', () => {
    const one = addState(emptyDefinition(), [], { task: 'app:http' }, 'Step 1', 'Step')
    const two = addState(one, [], { type: 'Choice' }, 'Step 2', 'Step')
    expect(two.stateMachine).toEqual({
      QueryLanguage: 'JSONata',
      StartAt: 'Step 1',
      States: { 'Step 1': { Type: 'Task', Resource: 'app:http', Arguments: {}, End: true }, 'Step 2': { Type: 'Choice', Choices: [] } },
    })
    expect(emptyDefinition().stateMachine.States).toEqual({})
  })

  it('leaves a state that ends the run unconnected where it would cut off the states after it', () => {
    const two = addStateAfter(addState(emptyDefinition(), [], { type: 'Pass' }, 'A', 'Step'), [], { type: 'Pass' }, 'B', 'Step', 'A')
    expect(two.stateMachine.States.A).toEqual({ Type: 'Pass', Next: 'B' })
    const between = addStateAfter(two, [], { type: 'Succeed' }, 'Done', 'Step', 'A')
    expect(between.stateMachine.States.A).toEqual({ Type: 'Pass', Next: 'B' })
    const last = addStateAfter(two, [], { type: 'Fail' }, 'Stop', 'Step', 'B')
    expect(last.stateMachine.States.B).toEqual({ Type: 'Pass', Next: 'Stop' })
    expect(addStateFirst(two, { type: 'Succeed' }, 'Done', 'Step').stateMachine.StartAt).toBe('A')
    expect(addStateFirst(emptyDefinition(), { type: 'Succeed' }, 'Done', 'Step').stateMachine.StartAt).toBe('Done')
  })

  it('builds a Block by hand, with a step of its own and one added inside it, that a save takes', () => {
    const block = addState(emptyDefinition(), [], { type: 'Block' }, 'Keep', 'Step')
    const inside = addStateAfter(block, ['Keep'], { task: 'app:http' }, 'Fetch', 'Step', 'Step 1')
    expect(inside.stateMachine.States.Keep).toEqual({
      Type: 'Block',
      Processor: { StartAt: 'Step 1', States: { 'Step 1': { Type: 'Pass', Next: 'Fetch' }, Fetch: { Type: 'Task', Resource: 'app:http', Arguments: {}, End: true } } },
      Cache: { Ttl: '1 hour' },
      End: true,
    })
    expect(checkDefinition(inside, { resources: ['app:http'], triggers: {} })).toEqual([])
  })

  it('places a state added with a Block or Map chosen after its last step, and one added with a step chosen after that step', () => {
    const block = addStateAfter(addState(emptyDefinition(), [], { type: 'Block' }, 'Keep', 'Step'), ['Keep'], { type: 'Pass' }, 'Fetch', 'Step', 'Step 1')
    expect(placeAfter(block, ['Keep'], 'Keep')).toBe('Fetch')
    expect(placeAfter(block, ['Keep'], 'Keep/Step 1')).toBe('Step 1')
    const map = addState(emptyDefinition(), [], { type: 'Map' }, 'Each', 'Item')
    expect(placeAfter(map, ['Each'], 'Each')).toBe('Item 1')
    expect(placeAfter(map, [], 'Each')).toBe('Each')
  })

  it('adds a Map with a state of its own, and a state inside a Map', () => {
    const map = addState(emptyDefinition(), [], { type: 'Map' }, 'Each', 'Item')
    const inside = addState(map, ['Each'], { type: 'Succeed' }, 'Done', 'Step')
    expect(inside.stateMachine.States.Each).toEqual({ Type: 'Map', Items: '{% [] %}', ItemProcessor: { StartAt: 'Item 1', States: { 'Item 1': { Type: 'Pass', End: true }, Done: { Type: 'Succeed' } } }, End: true })
  })

  it('names a new state after every name taken, in Maps too', () => {
    expect(freeName(ticketsWorkflow, 'Mail')).toBe('Mail 1')
    const taken = addState(ticketsWorkflow, ['Each'], { type: 'Pass' }, 'Step 1', 'Step')
    expect(freeName(taken, 'Step')).toBe('Step 2')
  })

  it('connects each handle by the field it sets, and disconnects it again', () => {
    let definition = addState(emptyDefinition(), [], { type: 'Choice' }, 'Pick', 'Step')
    definition = addState(definition, [], { type: 'Succeed' }, 'Yes', 'Step')
    definition = addState(definition, [], { type: 'Fail' }, 'No', 'Step')
    definition = addState(definition, [], { task: 'app:http' }, 'Call', 'Step')
    definition = connect(definition, 'rule', 'Pick', 'Call')
    definition = connect(definition, 'default', 'Pick', 'No')
    definition = connect(definition, 'next', 'Call', 'Yes')
    definition = connect(definition, 'catch', 'Call', 'No')
    expect(definition.stateMachine.States).toEqual({
      Pick: { Type: 'Choice', Choices: [{ Condition: '', Next: 'Call' }], Default: 'No' },
      Yes: { Type: 'Succeed' },
      No: { Type: 'Fail' },
      Call: { Type: 'Task', Resource: 'app:http', Arguments: {}, Next: 'Yes', Catch: [{ ErrorEquals: ['States.ALL'], Next: 'No' }] },
    })
    definition = disconnect(definition, { kind: 'next', source: 'Call', field: 'Next' })
    definition = disconnect(definition, { kind: 'catch', source: 'Call', field: 'Catch[0].Next' })
    definition = disconnect(definition, { kind: 'rule', source: 'Pick', field: 'Choices[0].Next' })
    expect(definition.stateMachine.States.Call).toEqual({ Type: 'Task', Resource: 'app:http', Arguments: {}, End: true })
    expect(definition.stateMachine.States.Pick).toEqual({ Type: 'Choice', Choices: [], Default: 'No' })
    expect(connect(definition, 'start', '', 'Call').stateMachine.StartAt).toBe('Call')
  })

  it('refuses an edge out of its machine, as the language has none', () => {
    expect(() => connect(ticketsWorkflow, 'next', 'Each/Mail', 'Done')).toThrow('A state leads only to states of its own machine')
  })

  it('removes a state and every edge to it, and starts at the first state left when it was the first', () => {
    const removed = removeState(ticketsWorkflow, 'Failed')
    expect(removed.stateMachine.States.Fetch).not.toHaveProperty('Catch')
    const each = removeState(ticketsWorkflow, 'Each')
    expect(each.stateMachine.States.Any).toEqual({ Type: 'Choice', Choices: [], Default: 'Done' })
    const first = removeState(ticketsWorkflow, 'Fetch')
    expect(first.stateMachine.StartAt).toBe('Any')
    const done = removeState(ticketsWorkflow, 'Each/Sent')
    expect(done.stateMachine.States.Each).toMatchObject({ ItemProcessor: { States: { Mail: { End: true } } } })
    expect(ticketsWorkflow.stateMachine.States.Failed).toBeDefined()
  })

  it('renames a state where it stands, and every edge to it', () => {
    const renamed = renameState(ticketsWorkflow, 'Done', 'Finished')
    expect(Object.keys(renamed.stateMachine.States)).toEqual(['Fetch', 'Any', 'Each', 'Finished', 'Failed'])
    expect(renamed.stateMachine.States.Any).toMatchObject({ Default: 'Finished' })
    expect(renamed.stateMachine.States.Each).toMatchObject({ Next: 'Finished' })
    expect(startAt(ticketsWorkflow, 'Each/Sent').stateMachine.States.Each).toMatchObject({ ItemProcessor: { StartAt: 'Sent' } })
  })
})
