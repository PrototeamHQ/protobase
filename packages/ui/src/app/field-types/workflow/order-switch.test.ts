import { describe, expect, it } from 'vitest'
import type { Definition } from '@protobase/workflows'
import { toDataOrder, toSequenceOrder } from './order-switch'

const sequence = (states: Record<string, unknown>, startAt = Object.keys(states)[0]!): Definition => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: startAt, States: states } }) as unknown as Definition
const data = (states: Record<string, unknown>): Definition => ({ trigger: { manual: {} }, order: 'data', stateMachine: { QueryLanguage: 'JSONata', States: states } }) as unknown as Definition

describe('toDataOrder', () => {
  it('turns each Next into a Condition on the earlier state where the later one reads none of its data, and Succeed into Pass', () => {
    const switched = toDataOrder(sequence({ Seed: { Type: 'Pass', Assign: { value: '{% 1 %}' }, Next: 'Done' }, Done: { Type: 'Succeed', Output: '{% { "value": 2 } %}' } }))
    expect(switched).toEqual({
      definition: data({ Seed: { Type: 'Pass', Assign: { value: '{% 1 %}' } }, Done: { Type: 'Pass', Output: '{% { "value": 2 } %}', Condition: "{% $states.context.Steps.Seed.Status = 'SUCCEEDED' %}" } }),
    })
  })

  it('refuses a Pass or Succeed without Output after another state, which in data order would not give on its output', () => {
    expect(toDataOrder(sequence({ Seed: { Type: 'Pass', Output: '{% { "value": 1 } %}', Next: 'Done' }, Done: { Type: 'Succeed' } }))).toEqual({
      refused: 'Done has no Output, so it gives the output of the state before it, which in data order it does not get; give it an Output that reads what it needs',
    })
    // The first state gives the run's input in either order
    expect(toDataOrder(sequence({ Only: { Type: 'Succeed' } }))).toEqual({ definition: data({ Only: { Type: 'Pass' } }) })
  })

  it('refuses a step sequence order never reaches, which data order would run on every run', () => {
    expect(toDataOrder(sequence({ Used: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://a.example' }, End: true }, Extra: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://b.example' }, End: true } }))).toEqual({
      refused: 'Extra is never reached in sequence order, where data order would run it on every run; connect it or remove it',
    })
  })

  it('refuses a loop of Nexts, which in data order would wait on itself', () => {
    expect(toDataOrder(sequence({ A: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://a.example' }, Next: 'B' }, B: { Type: 'Task', Resource: 'app:http', Arguments: { url: 'https://b.example' }, Next: 'A' } }))).toEqual({
      refused: 'A runs again in a loop of Next; in data order each state runs once',
    })
  })
})

describe('toSequenceOrder', () => {
  it('chains the states in an order every dependency keeps', () => {
    const switched = toSequenceOrder(data({ Save: { Type: 'Pass', Output: '{% $a %}' }, A: { Type: 'Pass', Assign: { a: '{% 1 %}' } } }))
    expect(switched).toEqual({ definition: { ...sequence({ A: { Type: 'Pass', Assign: { a: '{% 1 %}' }, Next: 'Save' }, Save: { Type: 'Pass', Output: '{% $a %}', End: true } }), order: 'sequence' } })
  })

  it('refuses a Pass without Output after the first state, which in sequence would give the output before it', () => {
    expect(toSequenceOrder(data({ A: { Type: 'Pass', Assign: { a: '{% 1 %}' } }, B: { Type: 'Pass', Output: '{% $a %}' }, Echo: { Type: 'Pass' } }))).toEqual({
      refused: "Echo has no Output, so it gives the run's input, which in sequence order would be the output of the state before it; give it an Output that reads what it needs",
    })
  })
})
