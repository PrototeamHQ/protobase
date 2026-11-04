import { describe, expect, it } from 'vitest'
import { checkDefinition } from './check-definition'
import { problemText } from './problem'

const check = (definition: unknown) => checkDefinition(definition, { resources: ['http'] }).map(problemText)

const fetchAndBranch = {
  QueryLanguage: 'JSONata',
  StartAt: 'Fetch',
  States: {
    Fetch: { Type: 'Task', Resource: 'http', Arguments: { url: '{% $trigger.url %}' }, Assign: { answer: '{% $states.result.body %}' }, Next: 'Big' },
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
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Sleep' } } })).toEqual(['State "A", field "Type": must be one of Pass, Task, Choice, Wait, Succeed, Fail, Map and Parallel'])
  })

  it('refuses a state that neither goes on nor ends, and the JSONPath language', () => {
    expect(check({ QueryLanguage: 'JSONata', StartAt: 'A', States: { A: { Type: 'Pass' } } })).toEqual(['State "A": needs either Next or End'])
    expect(check({ QueryLanguage: 'JSONPath', StartAt: 'A', States: { A: { Type: 'Pass', End: true } } })).toEqual(['Field "QueryLanguage": must be "JSONata"'])
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
      'State "A", field "Assign.total": reads the state\'s input; read the run\'s input as $trigger and an earlier result by the variable a state assigned it to',
      'State "A", field "Assign.copy": reads $states.input, which only the first state of a Map\'s item processor may read (as the item)',
      'State "A", field "Assign.other": reads $missing, which no state assigns in this scope',
      'State "A", field "Assign.run": calls $eval, whose reads cannot be checked',
      'State "B", field "Output": reads the state\'s input; read the run\'s input as $trigger and an earlier result by the variable a state assigned it to',
    ])
  })

  it('lets filters, lambdas and bindings read relative names, and $states.errorOutput only in a catcher', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'A',
      States: {
        A: {
          Type: 'Task',
          Resource: 'http',
          Arguments: { url: '{% ($base := $trigger.base; $base & "/" & $join($map($trigger.items[price > 1], function($item) { $item.id }), ",")) %}' },
          Output: '{% $states.errorOutput %}',
          Catch: [{ ErrorEquals: ['States.ALL'], Assign: { failure: '{% $states.errorOutput.Cause %}' }, Next: 'B' }],
          Next: 'B',
        },
        B: { Type: 'Succeed' },
      },
    }
    expect(check(definition)).toEqual(['State "A", field "Output": reads $states.errorOutput, which is not there (here: $states.result)'])
  })

  it('names states inside a Map and a Parallel by their path, and a parse error by its place', () => {
    const definition = {
      QueryLanguage: 'JSONata',
      StartAt: 'Each',
      States: {
        Each: {
          Type: 'Map',
          Items: '{% $trigger.items %}',
          ItemProcessor: { StartAt: 'First', States: { First: { Type: 'Pass', Next: 'Second' }, Second: { Type: 'Pass', Output: '{% $states.input %}', End: true } } },
          Next: 'Both',
        },
        Both: { Type: 'Parallel', Branches: [{ StartAt: 'One', States: { One: { Type: 'Pass', Output: '{% 1 + %}', End: true } } }], End: true },
      },
    }
    expect(check(definition)).toEqual([
      'State "Each/Second", field "Output": reads $states.input, which only the first state of a Map\'s item processor may read (as the item)',
      'State "Both/0/One", field "Output": does not parse: Unexpected end of expression (at character 5)',
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
    expect(check(definition)).toEqual(['State "After", field "Output": reads $item, which no state assigns in this scope'])
  })
})
