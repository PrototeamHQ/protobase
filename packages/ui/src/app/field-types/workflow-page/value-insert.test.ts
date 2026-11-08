import { describe, expect, it } from 'vitest'
import type { Definition } from '@protobase/workflows'
import { earlierSteps, readOf, sampleValues, variableFor, withRead } from './value-insert'

const definition = {
  trigger: { manual: {} },
  stateMachine: {
    QueryLanguage: 'JSONata',
    StartAt: 'Fetch customer',
    States: {
      'Fetch customer': { Type: 'Task', Resource: 'app:http', Next: 'Urgent' },
      Urgent: { Type: 'Choice', Choices: [{ Condition: '{% true %}', Next: 'Each' }], Default: 'Mail' },
      Each: { Type: 'Map', Items: '{% [] %}', ItemProcessor: { StartAt: 'Get', States: { Get: { Type: 'Task', Resource: 'app:http', Next: 'Keep' }, Keep: { Type: 'Task', Resource: 'app:http', End: true } } }, Next: 'Mail' },
      Mail: { Type: 'Task', Resource: 'app:mail.send', End: true },
    },
  },
} as unknown as Definition

describe('sampleValues', () => {
  it('lists the whole value and each field below it, a list by its first item', () => {
    expect(sampleValues({ a: 1, 'b c': { d: [{ e: 'x' }] } })).toEqual([
      { path: '', sample: '{"a":1,"b c":{"d":[{"e":"x"}]}}' },
      { path: 'a', sample: '1' },
      { path: '`b c`', sample: '{"d":[{"e":"x"}]}' },
      { path: '`b c`.d', sample: '[{"e":"x"}]' },
      { path: '`b c`.d[0]', sample: '{"e":"x"}' },
      { path: '`b c`.d[0].e', sample: '"x"' },
    ])
  })
})

describe('readOf', () => {
  it('reads below what holds the value', () => {
    expect(readOf('$customer', '')).toBe('$customer')
    expect(readOf('$customer', 'email')).toBe('$customer.email')
    expect(readOf('$list', '[0].id')).toBe('$list[0].id')
  })
})

describe('withRead', () => {
  it('fills an empty field, and joins to what a field holds without replacing it', () => {
    expect(withRead(undefined, '$a.b')).toBe('{% $a.b %}')
    expect(withRead("It's for ", '$a.b')).toBe(`{% "It's for " & $a.b %}`)
    expect(withRead('{% $x %}', '$a.b')).toBe('{% ($x) & $a.b %}')
  })

  it('keeps quotes and backslashes of the text, and the grouping of an expression, it joins to', () => {
    expect(withRead('say "hi" \\ ', '$a')).toBe('{% "say \\"hi\\" \\\\ " & $a %}')
    expect(withRead("{% $n > 1 ? 'a' : 'b' %}", '$a')).toBe("{% ($n > 1 ? 'a' : 'b') & $a %}")
  })

  it('refuses a field holding anything but text, which it would replace', () => {
    expect(() => withRead({ Accept: 'application/json' }, '$a.b')).toThrow('holds text')
  })
})

describe('earlierSteps', () => {
  it('lists the steps that give a result and can come first, around a Map too', () => {
    expect(earlierSteps(definition, 'Mail')).toEqual(['Fetch customer', 'Each'])
    expect(earlierSteps(definition, 'Each/Keep')).toEqual(['Fetch customer', 'Each/Get'])
    expect(earlierSteps(definition, 'Fetch customer')).toEqual([])
  })
})

describe('variableFor', () => {
  it('adds a variable named after the step, and leaves the definition it was given as it was', () => {
    const { definition: next, variable, added } = variableFor(definition, 'Fetch customer')
    expect({ variable, added }).toEqual({ variable: 'fetch_customer', added: true })
    expect((next.stateMachine.States['Fetch customer'] as { Assign?: unknown }).Assign).toEqual({ fetch_customer: '{% $states.result %}' })
    expect((definition.stateMachine.States['Fetch customer'] as { Assign?: unknown }).Assign).toBeUndefined()
  })

  it('reuses the variable a step has, and picks a name no other state uses', () => {
    const once = variableFor(definition, 'Fetch customer')
    expect(variableFor(once.definition, 'Fetch customer')).toMatchObject({ variable: 'fetch_customer', added: false })
    const named = structuredClone(once.definition)
    ;(named.stateMachine.States.Mail as { Assign?: unknown }).Assign = { each: 1 }
    expect(variableFor(named, 'Each').variable).toBe('each_2')
  })
})
