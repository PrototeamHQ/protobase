import { describe, expect, it } from 'vitest'
import { limits } from '../../limits'
import { nestingDepth } from '../../nesting'
import { importStateMachine } from './import-machine'

const depthProblem = { message: `The definition nests more than ${limits.definitionDepth} levels of arrays and objects` }

const call = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke', Arguments: { ApiEndpoint: 'https://a.example', Method: 'GET' }, End: true }

// A Map inside a Map, `levels` deep, with the HTTP task innermost: each level nests three objects, built in a loop so
// no depth overflows the test's own stack
const nested = (levels: number) => {
  let machine: Record<string, unknown> = { States: { Call: call } }
  for (let level = 0; level < levels; level++) machine = { States: { Each: { Type: 'Map', ItemProcessor: machine } } }
  return machine
}

describe('importStateMachine', () => {
  it('imports the HTTP tasks inside a Map and leaves every other state as it is', () => {
    const machine = { QueryLanguage: 'JSONata', StartAt: 'Each', States: { Each: { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { StartAt: 'Call', States: { Call: call } }, Next: 'Mail' }, Mail: { Type: 'Task', Resource: 'app:mail.send', End: true } } }
    const { stateMachine, problems } = importStateMachine(machine)
    expect(problems).toEqual([])
    const states = stateMachine.States as Record<string, Record<string, Record<string, Record<string, Record<string, unknown>>>>>
    expect(states.Each!.ItemProcessor!.States!.Call!.Resource).toBe('app:http')
    expect(states.Mail).toEqual(machine.States.Mail)
  })

  it('names the state inside the Map that does not import, and leaves JSONPath and other services to the check', () => {
    const machine = { StartAt: 'Each', States: { Each: { Type: 'Map', ItemProcessor: { States: { Call: { ...call, Arguments: '{% $x %}' } } } }, Old: { ...call, Arguments: undefined, Parameters: {} }, Wait: { Type: 'Task', Resource: 'arn:aws:states:::http:invoke.waitForTaskToken' } } }
    const { stateMachine, problems } = importStateMachine(machine)
    expect(problems.map(({ state, field }) => [state, field])).toEqual([['Each/Call', 'Arguments']])
    expect((stateMachine.States as Record<string, unknown>).Old).toEqual(machine.States.Old)
    expect((stateMachine.States as Record<string, unknown>).Wait).toEqual(machine.States.Wait)
  })

  it('gives back a machine nesting past the depth limit as it is, with the depth problem, before walking it', () => {
    // Deep enough to overflow the stack if the import recursed through it
    const deep = nested(20_000)
    const { stateMachine, problems } = importStateMachine(deep)
    expect(stateMachine).toBe(deep)
    expect(problems).toEqual([depthProblem])
    const past = nested(85)
    expect(nestingDepth(past, 1000)).toBe(limits.definitionDepth + 3)
    expect(importStateMachine(past)).toEqual({ stateMachine: past, problems: [depthProblem] })
  })

  it('imports a machine nesting exactly as deep as the limit allows', () => {
    const atLimit = nested(84)
    expect(nestingDepth(atLimit, 1000)).toBe(limits.definitionDepth)
    const { stateMachine, problems } = importStateMachine(atLimit)
    expect(problems).toEqual([])
    expect(JSON.stringify(stateMachine)).toContain('"Resource":"app:http"')
  })
})
