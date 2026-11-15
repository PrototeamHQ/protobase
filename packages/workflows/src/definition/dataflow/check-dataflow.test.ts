import { describe, expect, it } from 'vitest'
import { checkDefinition } from '../check-definition'
import type { Definition } from '../types'
import { machineDependencies } from './dependencies'

const options = { resources: ['app:http', 'app:records.update', 'app:mail.send'], triggers: {} }

const http = (url: string, variable: string) => ({ Type: 'Task', Resource: 'app:http', Arguments: { url }, Assign: { [variable]: '{% $states.result %}' } })

// Two requests that run at once, a write that reads both, and mail only once the write succeeded
const flow = (states: Record<string, unknown> = {}) => ({
  trigger: { manual: {} },
  order: 'data',
  stateMachine: {
    QueryLanguage: 'JSONata',
    States: {
      Ip: http('https://api.ipify.org?format=json', 'ip'),
      Time: http('https://example.com/time', 'time'),
      Save: { Type: 'Task', Resource: 'app:records.update', Arguments: { resource: 'contacts', key: '1', data: { name: '{% $ip.body.ip & " at " & $time.body.now %}' } } },
      Mail: { Type: 'Task', Resource: 'app:mail.send', Condition: "{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}", Arguments: { to: 'ops@example.com', subject: 'Saved', text: 'done' } },
      ...states,
    },
  },
})

describe('dataflow order', () => {
  it('takes a machine with no start and no Next, whose states run after the ones they read from', () => {
    expect(checkDefinition(flow(), options)).toEqual([])
    const dependencies = machineDependencies(flow().stateMachine as never)
    expect(dependencies.get('Save')).toEqual({ data: new Set(['Ip', 'Time']), status: new Set(), handled: new Set() })
    expect(dependencies.get('Mail')).toEqual({ data: new Set(), status: new Set(['Save']), handled: new Set(['Save']) })
    expect(dependencies.get('Ip')!.data.size + dependencies.get('Ip')!.status.size).toBe(0)
  })

  it('refuses the fields of sequence order in dataflow order, and Condition in sequence order', () => {
    const next = flow({ Ip: { ...http('https://a.example', 'ip'), Next: 'Save' } })
    expect(checkDefinition(next, options)).toContainEqual({ state: 'Ip', message: 'Next is not a field in dataflow order, where a state runs once the states it reads from have ended' })
    const choice = flow({ Pick: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Next: 'Save' }] } })
    expect(checkDefinition(choice, options)[0]!.message).toMatch(/^must be one of Task, Pass, Map, Block, Wait and Fail/)
    const sequence = { trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass', Condition: '{% true %}', End: true } } } }
    expect(checkDefinition(sequence, options)).toContainEqual({ state: 'A', message: 'Condition is a field only in dataflow order ("order": "data"); in sequence order a Choice decides' })
  })

  it('refuses a variable two states assign, a cycle, an unknown Steps entry and $states.input outside an item', () => {
    expect(checkDefinition(flow({ Time: http('https://example.com/time', 'ip') }), options)).toContainEqual({ state: 'Time', field: 'Assign', message: 'assigns $ip, which Ip assigns already; in dataflow order each variable has one state that assigns it' })
    const cycle = flow({ Ip: { ...http('{% $time.body.url %}', 'ip') }, Time: http('{% $ip.body.url %}', 'time') })
    expect(checkDefinition(cycle, options)).toContainEqual({ state: 'Ip', message: 'runs after itself: Ip reads Time reads Ip; a state cannot read what runs after it' })
    const unknown = flow({ Mail: { Type: 'Task', Resource: 'app:mail.send', Condition: "{% $states.context.Steps.Nope.Status = 'SUCCEEDED' %}", Arguments: { to: 'a@example.com', subject: 's', text: 't' } } })
    expect(checkDefinition(unknown, options)).toContainEqual({ state: 'Mail', field: 'Condition', message: 'reads $states.context.Steps.Nope, but there is no state Nope here or around it' })
    const input = flow({ Ip: http('{% $states.input.url %}', 'ip') })
    expect(checkDefinition(input, options)).toContainEqual({ state: 'Ip', field: 'Arguments.url', message: "reads $states.input, which only the first state of a Map's item processor may read (as the item)" })
  })

  it('is a Definition as the types say, with no StartAt', () => {
    const definition: Definition = { order: 'data', trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', States: { Done: { Type: 'Pass' } } } }
    expect(checkDefinition(definition, options)).toEqual([])
  })
})
