import { describe, expect, it } from 'vitest'
import { checkDefinition } from './check-definition'
import { problemText } from './problem'

const triggers = { 'app:schedule': (input: Record<string, unknown>) => (typeof input.cron === 'string' ? [] : [{ field: 'cron', message: 'is missing' }]), 'acme:new_order': () => [] }
const check = (machine: object, trigger: object = { manual: {} }) => checkDefinition({ trigger, stateMachine: machine }, { resources: ['http'], triggers }).map(problemText)

const fetchAndBranch = {
  QueryLanguage: 'JSONata',
  StartAt: 'Fetch',
  States: {
    Fetch: { Type: 'Task', Resource: 'http', Arguments: { url: '{% $states.context.Execution.Input.url %}' }, Assign: { answer: '{% $states.result.body %}' }, Next: 'Big' },
    Big: { Type: 'Choice', Choices: [{ Condition: '{% $count($answer.items) > 2 %}', Next: 'Each' }], Default: 'Done' },
    Each: {
      Type: 'Map',
      Items: '{% $answer.items %}',
      ItemProcessor: { StartAt: 'Double', States: { Double: { Type: 'Pass', Output: '{% $states.input * 2 %}', End: true } } },
      Assign: { doubled: '{% $states.result %}' },
      Next: 'Done',
    },
    Done: { Type: 'Succeed', Output: '{% {"total": $sum($doubled)} %}' },
  },
}

describe('checkDefinition', () => {
  it('takes a definition that reads every value by name', () => {
    expect(check(fetchAndBranch)).toEqual([])
  })

  it('names the state and field of a missing field, a field of no state and a wrong type', () => {
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Task', Arguments: {}, End: true, Retry: [{ ErrorEquals: ['States.ALL'], IntervalSeconds: 'soon' }] } } })).toEqual([
      'State "A": Resource is missing',
      'State "A", field "Retry[0].IntervalSeconds": must be integer',
    ])
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass', InputPath: '$.x', End: true } } })).toEqual(['State "A": InputPath is not a field here'])
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Sleep' } } })).toEqual(['State "A", field "Type": must be one of Task, Choice, Pass, Map, Wait, Succeed and Fail'])
  })

  it('refuses a state that neither goes on nor ends, and the JSONPath language', () => {
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass' } } })).toEqual(['State "A": needs either Next or End'])
    expect(check({ QueryLanguage: 'JSONPath', StartAt: 'A', States: { A: { Type: 'Pass', End: true } } })).toEqual(['Field "stateMachine.QueryLanguage": must be "JSONata"'])
  })

  it('refuses an edge to no state, an unreached state and an unknown step type', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: { A: { Type: 'Task', Resource: 'ftp', Next: 'Gone', Catch: [{ ErrorEquals: ['States.ALL'], Next: 'Also gone' }] }, Lost: { Type: 'Succeed' } },
    }
    expect(check(definition)).toEqual([
      'State "A", field "Next": names "Gone", which is not a state here',
      'State "A", field "Catch[0].Next": names "Also gone", which is not a state here',
      'State "A", field "Resource": "ftp" is not a step type; use one of http',
      'State "Lost": is never reached from "A"',
    ])
  })

  it("refuses reads of a state's implicit input, of a variable nobody assigns, and $eval", () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: {
        A: { Type: 'Pass', Assign: { total: '{% order.total %}', copy: '{% $states.input %}', other: '{% $missing + 1 %}', run: '{% $eval("1") %}' }, Next: 'B' },
        B: { Type: 'Pass', Output: '{% $ %}', End: true },
      },
    }
    expect(check(definition)).toEqual([
      'State "A", field "Assign.total": reads the state\'s input; read the run\'s input as $states.context.Execution.Input and an earlier result by the variable a state assigned it to',
      'State "A", field "Assign.copy": reads $states.input, which only the first state of a Map\'s item processor may read (as the item)',
      'State "A", field "Assign.other": reads $missing, which no state that can run before it assigns',
      'State "A", field "Assign.run": uses $eval, whose reads cannot be checked',
      'State "B", field "Output": reads the state\'s input; read the run\'s input as $states.context.Execution.Input and an earlier result by the variable a state assigned it to',
    ])
  })

  it('refuses $eval passed on as a value, and a name that only a function or block inside binds', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: {
        A: {
          Type: 'Pass',
          Assign: {
            alias: '{% ($f := $eval; $f("$states.input")) %}',
            text: '{% "a $eval(1) in a text" %}',
            param: '{% $missing + $count($map([1], function($missing) { $missing })) %}',
            inner: '{% ($n := 1; $n) + $n %}',
            recursive: '{% ($f := function($n) { $n < 1 ? 0 : $f($n - 1) }; $f(3)) %}',
          },
          End: true,
        },
      },
    }
    expect(check(definition)).toEqual([
      'State "A", field "Assign.alias": uses $eval, whose reads cannot be checked',
      'State "A", field "Assign.param": reads $missing, which no state that can run before it assigns',
      'State "A", field "Assign.inner": reads $n, which no state that can run before it assigns',
    ])
  })

  it("lets a choice rule's and a catcher's variables be read only along their own edge", () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'Fetch',
      States: {
        Fetch: { Type: 'Task', Resource: 'http', Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput.Cause %}' }, Next: 'Report' }], Next: 'Pick' },
        Pick: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Assign: { size: '{% "big" %}' }, Next: 'Big' }], Default: 'Small' },
        Big: { Type: 'Succeed', Output: '{% $size %}' },
        Small: { Type: 'Succeed', Output: '{% [$size, $failure] %}' },
        Report: { Type: 'Fail', Error: 'Failed', Cause: '{% $failure %}' },
      },
    }
    expect(check(definition)).toEqual([
      'State "Small", field "Output": reads $size, which no state that can run before it assigns',
      'State "Small", field "Output": reads $failure, which no state that can run before it assigns',
    ])
  })

  it('refuses a definition nested deeper than it may be, before any walk of it', () => {
    let output: unknown = 1
    for (let level = 0; level < 3000; level++) output = [output]
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass', Output: output, End: true } } })).toEqual(['The definition nests more than 256 levels of arrays and objects'])
  })

  it('lets filters, lambdas and bindings read relative names, and $states.errorOutput only in a catcher', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: {
        A: {
          Type: 'Task',
          Resource: 'http',
          Arguments: { url: '{% ($base := $states.context.Execution.Input.base; $base & "/" & $join($map($states.context.Execution.Input.items[price > 1], function($item) { $item.id }), ",")) %}' },
          Output: '{% $states.errorOutput %}',
          Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput.Cause %}' }, Next: 'B' }],
          Next: 'B',
        },
        B: { Type: 'Succeed' },
      },
    }
    expect(check(definition)).toEqual(['State "A", field "Output": reads $states.errorOutput, which is not there (here: $states.result)'])
  })

  it('names states inside a Map by their path, and a parse error by its place', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'Each',
      States: {
        Each: {
          Type: 'Map',
          Items: '{% $states.context.Execution.Input.items %}',
          ItemProcessor: { StartAt: 'First', States: { First: { Type: 'Pass', Next: 'Second' }, Second: { Type: 'Pass', Output: '{% $states.input %}', End: true } } },
          Next: 'Last',
        },
        Last: { Type: 'Pass', Output: '{% 1 + %}', End: true },
      },
    }
    expect(check(definition)).toEqual([
      'State "Each/Second", field "Output": reads $states.input, which only the first state of a Map\'s item processor may read (as the item)',
      'State "Last", field "Output": does not parse: Unexpected end of expression (at character 5)',
    ])
  })

  it('keeps variables assigned in an item processor inside it', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'Each',
      States: {
        Each: { Type: 'Map', Items: '{% [1, 2] %}', ItemProcessor: { StartAt: 'Keep', States: { Keep: { Type: 'Pass', Assign: { item: '{% $states.input %}' }, End: true } } }, Next: 'After' },
        After: { Type: 'Pass', Output: '{% $item %}', End: true },
      },
    }
    expect(check(definition)).toEqual(['State "After", field "Output": reads $item, which no state that can run before it assigns'])
  })
})

describe('checkDefinition, the rules of the decided profile', () => {
  const pass = { Type: 'Pass', End: true }

  it('takes manual and the trigger types the app has, checked by their type, and refuses two, an unknown type and a bad name', () => {
    const machine = { QueryLanguage: 'JSONata', StartAt: 'A', States: { A: pass } }
    for (const trigger of [{ 'app:schedule': { cron: '0 6 * * *' } }, { 'acme:new_order': {} }, { manual: {} }]) expect(check(machine, trigger)).toEqual([])
    expect(check(machine, { 'app:schedule': {}, manual: {} })).toEqual(['Field "trigger": holds exactly one trigger: a trigger type such as app:record, or manual'])
    expect(check(machine, { 'app:schedule': {} })).toEqual(['Field "trigger.app:schedule.cron": is missing'])
    expect(check(machine, { 'app:mail': {} })).toEqual(['Field "trigger": "app:mail" is not a trigger type; use manual or one of app:schedule, acme:new_order'])
    expect(check(machine, { manual: { at: 1 } })).toEqual(['Field "trigger.manual": takes no input'])
    expect(check(machine, { Webhook: {} })).toContain('Field "trigger": names a trigger type <plugin>:<key>, such as app:record, or manual')
  })

  it('refuses Parallel, more than 19 retries, more than 20 at once and a state name used twice', () => {
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Parallel', Branches: [], End: true } } })).toEqual(['State "A", field "Type": must be one of Task, Choice, Pass, Map, Wait, Succeed and Fail'])
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Task', Resource: 'http', Retry: [{ ErrorEquals: ['States.ALL'], MaxAttempts: 20 }], End: true } } })).toEqual(['State "A", field "Retry[0].MaxAttempts": must be <= 19'])
    const map = (concurrency: number, inner: string) => ({ Type: 'Map', Items: '{% [1] %}', MaxConcurrency: concurrency, ItemProcessor: { StartAt: inner, States: { [inner]: pass } }, End: true })
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: map(21, 'B') } })).toEqual(['State "A", field "MaxConcurrency": must be <= 20'])
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: map(0, 'A') } })).toEqual(['State "A": is a state name used twice; names are unique across the whole state machine, Maps included'])
  })

  it('refuses more than 100 states, counting the ones inside Maps, and a definition or expression over its size', () => {
    const states = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`S${index}`, index === 99 ? pass : { Type: 'Pass', Next: `S${index + 1}` }]))
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'S0', States: states })).toEqual([])
    const more = { ...states, S99: { Type: 'Map', Items: '{% [1] %}', ItemProcessor: { StartAt: 'In', States: { In: pass } }, End: true } }
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'S0', States: more })).toEqual(['Field "stateMachine.States": holds 101 states, more than the 100 a workflow may have'])
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass', Output: `{% ${'1 + '.repeat(1200)}1 %}`, End: true } } })).toEqual(['State "A", field "Output": is 4803 characters long, more than the 4096 an expression may be'])
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass', Comment: 'x'.repeat(256 * 1024), End: true } } })).toEqual([`The definition is ${256 * 1024 + 137} bytes as JSON, more than the 262144 a workflow may have`])
  })

  it('reads of $states.context: only the input, the start time and a secret by name', () => {
    const reading = (expression: string) => check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass', Output: `{% ${expression} %}`, End: true } } })
    expect(reading('[$states.context.Execution.Input.body.id, $states.context.Execution.StartTime, $states.context.Secrets.API_TOKEN]')).toEqual([])
    expect(reading('$states.context.Secrets')).toEqual(['State "A", field "Output": reads $states.context.Secrets as a whole; read one secret by its name, such as $states.context.Secrets.API_TOKEN'])
    expect(reading('$states.context.Secrets.*')).toEqual(['State "A", field "Output": reads $states.context.Secrets as a whole; read one secret by its name, such as $states.context.Secrets.API_TOKEN'])
    expect(reading('$states.context.Execution')).toEqual(['State "A", field "Output": reads $states.context.Execution; $states.context holds only Execution.Input, Execution.StartTime and Secrets.<NAME>'])
    expect(reading('$states.context.State.Name')).toEqual(['State "A", field "Output": reads $states.context.State.Name; $states.context holds only Execution.Input, Execution.StartTime and Secrets.<NAME>'])
  })

  it('sees a variable only in the states that can run after the one that assigns it, and keeps an outer name from an inner Assign', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'Pick',
      States: {
        Pick: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Next: 'Left', Assign: { side: '{% "left" %}' } }], Default: 'Right' },
        Left: { Type: 'Pass', Assign: { left: '{% $side %}' }, Next: 'Join' },
        Right: { Type: 'Pass', Output: '{% $left %}', Next: 'Join' },
        Join: {
          Type: 'Map',
          Items: '{% [$side] %}',
          ItemProcessor: { StartAt: 'Item', States: { Item: { Type: 'Pass', Assign: { side: '{% $states.input %}' }, End: true } } },
          End: true,
        },
      },
    }
    expect(check(definition)).toEqual([
      'State "Right", field "Output": reads $left, which no state that can run before it assigns',
      'State "Join/Item", field "Assign": cannot assign $side, which an outer state assigns already',
    ])
  })

  it("refuses a Task without an argument its step type needs, unless its Arguments is one expression", () => {
    const task = (Arguments: unknown) => ({ QueryLanguage: 'JSONata', StartAt: 'Fetch', States: { Fetch: { Type: 'Task', Resource: 'http', ...(Arguments !== undefined && { Arguments }), End: true } } })
    const withRequired = (Arguments: unknown) => checkDefinition({ trigger: { manual: {} }, stateMachine: task(Arguments) }, { resources: ['http'], required: { http: ['url'] }, triggers }).map(problemText)
    expect(withRequired({ method: 'GET' })).toEqual(['State "Fetch", field "Arguments.url": is missing; http needs it'])
    expect(withRequired(undefined)).toEqual(['State "Fetch", field "Arguments.url": is missing; http needs it'])
    expect(withRequired({ url: '' })).toEqual(['State "Fetch", field "Arguments.url": is missing; http needs it'])
    expect(withRequired({ url: 'https://example.com' })).toEqual([])
    expect(withRequired('{% {"url": "https://example.com"} %}')).toEqual([])
  })
})
