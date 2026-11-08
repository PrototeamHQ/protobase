import { describe, expect, it } from 'vitest'
import type { Definition } from '@protobase/workflows'
import { changedSinceRun, reachedStates, stepsThatAct } from './run-effects'

const definition = {
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch',
    States: {
      Fetch: { Type: 'Task', Resource: 'app:records.get', Next: 'Urgent' },
      Urgent: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Next: 'Mail' }], Default: 'Each' },
      Mail: { Type: 'Task', Resource: 'app:mail.send', End: true, Catch: [{ ErrorEquals: ['States.ALL'], Next: 'Sorry' }] },
      Sorry: { Type: 'Fail' },
      Each: { Type: 'Map', Items: '{% [] %}', ItemProcessor: { StartAt: 'Store', States: { Store: { Type: 'Task', Resource: 'other:write', End: true } } }, End: true },
      Lonely: { Type: 'Succeed' },
    },
  },
} as unknown as Definition

const types = { triggers: [], step_types: [{ id: 'app:records.get', writes: false }, { id: 'app:mail.send', label: 'Send mail', writes: true }] } as never

describe('reachedStates', () => {
  it('follows every edge from a state, and leaves out what cannot be reached', () => {
    expect(reachedStates(definition.stateMachine, 'Urgent')).toEqual(['Urgent', 'Mail', 'Each', 'Sorry'])
  })
})

describe('stepsThatAct', () => {
  it('names the steps that write, in a Map too, and counts a type it does not know as one that writes', () => {
    expect(stepsThatAct(definition, types).map((step) => step.name)).toEqual(['Mail', 'Store'])
  })

  it('starts where it is told', () => {
    expect(stepsThatAct(definition, types, 'Each').map((step) => step.name)).toEqual(['Store'])
  })
})

describe('changedSinceRun', () => {
  const ran = (Fetch: Record<string, unknown>) => ({ ...definition, stateMachine: { ...definition.stateMachine, States: { ...definition.stateMachine.States, Fetch } } }) as unknown as Definition
  const fetch = { Type: 'Task', Resource: 'app:records.get', Next: 'Urgent' }
  const keeping = { ...fetch, Assign: { fetch: '{% $states.result %}' } }

  it('takes a variable keeping the whole result for no change, which a re-run gives from the kept step', () => {
    expect(changedSinceRun(ran(fetch), ran(keeping), 'Fetch')).toBe(false)
    expect(changedSinceRun(ran(fetch), ran({ ...fetch, Next: 'Mail' }), 'Fetch')).toBe(true)
  })

  it('takes it for a change when the step shaped its result with Output, which the re-run cannot give it from', () => {
    const shaped = { ...fetch, Output: '{% $states.result.id %}' }
    expect(changedSinceRun(ran(shaped), ran({ ...shaped, Assign: keeping.Assign }), 'Fetch')).toBe(true)
  })
})
