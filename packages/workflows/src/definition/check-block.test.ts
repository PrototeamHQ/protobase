import { describe, expect, it } from 'vitest'
import { blockReads } from './block-reads'
import { checkDefinition } from './check-definition'
import { definitionWarnings } from './check-warnings'
import { problemText } from './problem'
import type { Definition, Machine, State } from './types'

const machine = (states: Record<string, unknown>, startAt = Object.keys(states)[0]!) => ({ QueryLanguage: 'JSONata', StartAt: startAt, States: states })
const check = (states: Record<string, unknown>) => checkDefinition({ trigger: { manual: {} }, stateMachine: machine(states) }, { resources: ['http'], triggers: {} }).map(problemText)

const fetching = { StartAt: 'Fetch', States: { Fetch: { Type: 'Task', Resource: 'http', Arguments: { url: '{% $states.context.Execution.Input.url %}' }, End: true } } }
const block = (extra: Record<string, unknown> = {}) => ({ Type: 'Block', Arguments: { url: '{% $states.context.Execution.Input.url %}' }, Processor: fetching, Cache: { Ttl: '1 hour' }, Assign: { file: '{% $states.result %}' }, Next: 'Done', ...extra })

describe('a Block in checkDefinition', () => {
  it('takes a block whose steps read its input', () => {
    expect(check({ Keep: block(), Done: { Type: 'Succeed', Output: '{% $file %}' } })).toEqual([])
  })

  it('refuses a missing, zero, negative or unreadable time to live', () => {
    for (const Ttl of [0, -1, 'forever', '1 fortnight']) expect(check({ Keep: block({ Cache: { Ttl } }), Done: { Type: 'Succeed' } })).toEqual([expect.stringMatching(/^State "Keep", field "Cache.Ttl": is no time to live/)])
    expect(check({ Keep: block({ Cache: {} }), Done: { Type: 'Succeed' } })).toEqual(['State "Keep", field "Cache": Ttl is missing'])
    expect(check({ Keep: block({ Cache: undefined }), Done: { Type: 'Succeed' } })).toEqual(['State "Keep": Cache is missing'])
  })

  it("refuses steps that read the variables around it, its run's start time, or Arguments that pass a secret", () => {
    const inner = { StartAt: 'Fetch', States: { Fetch: { Type: 'Task', Resource: 'http', Arguments: { url: '{% $outer %}', at: '{% $states.context.Execution.StartTime %}' }, End: true } } }
    expect(check({ Set: { Type: 'Pass', Assign: { outer: 1 }, Next: 'Keep' }, Keep: block({ Processor: inner }), Done: { Type: 'Succeed' } })).toEqual([
      'State "Keep/Fetch", field "Arguments.url": reads $outer, which no state that can run before it assigns',
      "State \"Keep/Fetch\", field \"Arguments.at\": reads $states.context.Execution.StartTime, which inside a Block is its own run's start, not part of what it is cached by",
    ])
    expect(check({ Keep: block({ Arguments: { token: '{% $states.context.Secrets.API_TOKEN %}' } }), Done: { Type: 'Succeed' } })).toEqual([
      'State "Keep", field "Arguments.token": reads a secret, which a block would keep in its run; read it inside the block as $states.context.Secrets.<NAME>',
    ])
  })

  it('names states inside a block uniquely across the document and refuses blocks nested more than 4 deep', () => {
    expect(check({ Fetch: { Type: 'Pass', Next: 'Keep' }, Keep: block(), Done: { Type: 'Succeed' } })).toEqual(['State "Fetch": is a state name used twice; names are unique across the whole state machine, Maps and Blocks included'])
    const nest = (depth: number): Record<string, unknown> => (depth === 0 ? fetching : { StartAt: `B${depth}`, States: { [`B${depth}`]: { ...block({ Processor: nest(depth - 1) }), Assign: undefined, Next: undefined, End: true } } })
    expect(check({ Keep: block({ Processor: nest(3) }), Done: { Type: 'Succeed' } })).toEqual([])
    expect(check({ Keep: block({ Processor: nest(4) }), Done: { Type: 'Succeed' } })).toEqual(['State "Keep/B4/B3/B2/B1": is inside 4 other Blocks, more than the 3 a Block may be in'])
  })
})

describe('blockReads', () => {
  it('reads the paths of its input its steps read and the secrets they read by name, not those of a block inside it', () => {
    const processor = {
      StartAt: 'A',
      States: {
        A: { Type: 'Task', Resource: 'http', Arguments: { url: '{% $states.context.Execution.Input.link.url %}', token: '{% $states.context.Secrets.API_TOKEN %}' }, Next: 'B' },
        B: { Type: 'Pass', Output: '{% $states.context.Execution.Input.link %}', Next: 'C' },
        C: { ...block({ Arguments: { name: '{% $states.context.Execution.Input.name %}' }, Processor: { StartAt: 'D', States: { D: { Type: 'Pass', Output: '{% $states.context.Execution.Input.inner %}', End: true } } } }), Assign: undefined, Next: undefined, End: true },
      },
    } as unknown as Machine
    expect(blockReads(processor)).toEqual({ input: [['link'], ['name']], secrets: ['API_TOKEN'] })
  })
})

describe('definitionWarnings', () => {
  const definition = (states: Record<string, unknown>) => ({ trigger: { manual: {} }, stateMachine: machine(states) }) as unknown as Definition
  const wait = { Type: 'Wait', Seconds: 3600, Next: 'Use' }

  it('warns on a step that reads, after a Wait, what a Block assigned before it', () => {
    expect(definitionWarnings(definition({ Keep: block({ Next: 'Later' }), Later: wait, Use: { Type: 'Succeed', Output: '{% $file %}' } }))).toEqual([
      { state: 'Use', message: 'reads $file, which the Block "Keep" assigned before the Wait "Later": what the block fetched, such as a link that expires, may have expired by then' },
    ])
  })

  it('warns on a Map whose items read it, and not without a Wait or when the block runs again after the Wait', () => {
    const map = { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { StartAt: 'Item', States: { Item: { Type: 'Pass', Output: '{% $file %}', End: true } } }, End: true }
    expect(definitionWarnings(definition({ Keep: block({ Next: 'Later' }), Later: wait, Use: map })).map((warning) => warning.state)).toEqual(['Use'])
    expect(definitionWarnings(definition({ Keep: block({ Next: 'Use' }), Use: { Type: 'Succeed', Output: '{% $file %}' } }))).toEqual([])
    expect(definitionWarnings(definition({ Keep: block({ Next: 'Later' }), Later: { Type: 'Wait', Seconds: 60, Next: 'Keep' } } as Record<string, unknown>))).toEqual([])
    const inner: State = { Type: 'Pass', End: true }
    expect(definitionWarnings(definition({ Keep: block({ Next: 'Later' }), Later: { ...wait, Next: 'Use' }, Use: inner }))).toEqual([])
  })
})
