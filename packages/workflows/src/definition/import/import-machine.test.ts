import { describe, expect, it } from 'vitest'
import { importStateMachine } from './import-machine'

const call = { Type: 'Task', Resource: 'arn:aws:states:::http:invoke', Arguments: { ApiEndpoint: 'https://a.example', Method: 'GET' }, End: true }

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
})
