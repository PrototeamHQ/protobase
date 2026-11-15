import { describe, expect, it } from 'vitest'
import { conditionParts, conditionValue, type ConditionPart } from './conditions'

const status = (step: string) => ({ read: { base: { step }, path: ['Status'] } })

describe('a Condition taken apart into nodes', () => {
  it("takes a step's status compared with a value apart, and writes it back as it was", () => {
    const condition = "{% $states.context.Steps.Save.Status = 'SUCCEEDED' %}"
    const part = conditionParts(condition)
    expect(part).toEqual({ kind: 'compare', op: '=', sides: [status('Save'), { value: 'SUCCEEDED' }] })
    expect(conditionValue(part!)).toBe(condition)
  })

  it('takes apart every comparison, And, Or and Not of reads and values, each written back byte for byte', () => {
    const conditions = [
      "{% $states.context.Steps.Save.Status != 'FAILED' %}",
      '{% $fetch.status > 399 %}',
      '{% $fetch.status < -1.5 %}',
      '{% $states.context.Execution.Input.record.name = "it\'s" %}',
      '{% $fetch.body.`ip address` = $states.context.Execution.Input.ip %}',
      '{% $done = true %}',
      "{% $states.context.Steps.A.Status = 'SUCCEEDED' and $states.context.Steps.AB.Status = 'SUCCEEDED' %}",
      '{% $a and $b and $c %}',
      '{% $a and ($b and $c) %}',
      '{% ($a or $b) and $c %}',
      '{% $a or $b and $c %}',
      '{% $not($fetch.status = 200) or $not($ok) %}',
      '{% $not(true) %}',
      '{% $a and $b and $c and $d %}',
      '{% $a or $b or $c and $d %}',
      '{% ($a and $b) and $c %}',
      '{% $contains($contact.email, /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/) %}',
      '{% $contains($states.context.Execution.Input.body.topic, /sales/i) and $states.context.Steps.Save.Status = \'SUCCEEDED\' %}',
      "{% $contains('fixed text', /a\\/b/m) %}",
    ]
    for (const condition of conditions) {
      const part = conditionParts(condition)
      expect(part, condition).toBeDefined()
      expect(conditionValue(part!)).toBe(condition)
    }
    // A chain of one operator is one node, however long; one in brackets is a node of its own
    const read = (variable: string) => ({ read: { base: { variable }, path: [] } })
    expect(conditionParts('{% $a and $b and $c %}')).toEqual({ kind: 'logic', op: 'and', sides: [read('a'), read('b'), read('c')] })
    expect(conditionParts('{% $a and ($b and $c) %}')).toEqual({ kind: 'logic', op: 'and', sides: [read('a'), { kind: 'logic', op: 'and', sides: [read('b'), read('c')] }] })
    expect(conditionParts('{% $contains($contact.email, /^.+@.+$/i) %}')).toEqual({ kind: 'matches', sides: [{ read: { base: { variable: 'contact' }, path: ['email'] } }, { pattern: '^.+@.+$', flags: 'i' }] })
    expect(conditionParts('{% ($a or $b) and $c %}')).toEqual({ kind: 'logic', op: 'and', sides: [{ kind: 'logic', op: 'or', sides: [{ read: { base: { variable: 'a' }, path: [] } }, { read: { base: { variable: 'b' }, path: [] } }] }, { read: { base: { variable: 'c' }, path: [] } }] })
  })

  it('leaves as an expression a Condition that computes, reads otherwise, or is written in any other way', () => {
    const kept = [
      '{% $count($tickets) > 0 %}',
      '{% $fetch.status >= 400 %}',
      '{% $fetch.body.items[0].ok = true %}',
      '{% $states.result.ok = true %}',
      '{% $states.context.Steps.Save.Status=\'SUCCEEDED\' %}',
      "{%  $states.context.Steps.Save.Status = 'SUCCEEDED' %}",
      "{% $states.context.Steps.Save.Status = \"SUCCEEDED\" %}",
      '{% ($a and $b) %}',
      '{% $a or ($b and $c) %}',
      '{% $a and \'yes\' %}',
      '{% $ok %}',
      '{% true %}',
      '{% $fetch.status = 1.50 %}',
      '{% $states.context.Steps.Save.Status = null %}',
      '{% $states.context.Steps.Save.Status = %}',
      '{% $contains($a, "text") %}',
      '{% $contains($a, /x/, 1) %}',
      '{% $contains($a, /x/g) %}',
      "$states.context.Steps.Save.Status = 'SUCCEEDED'",
      true,
    ]
    for (const condition of kept) expect(conditionParts(condition), String(condition)).toBeUndefined()
  })

  it('writes a value in single quotes unless it holds one, a backslash or a control character', () => {
    const text = (value: string): ConditionPart => ({ kind: 'compare', op: '=', sides: [{ read: { base: { variable: 'a' }, path: [] } }, { value }] })
    expect(conditionValue(text('plain'))).toBe("{% $a = 'plain' %}")
    expect(conditionValue(text("it's"))).toBe('{% $a = "it\'s" %}')
    expect(conditionValue(text('a\\b\n'))).toBe('{% $a = "a\\\\b\\n" %}')
    for (const value of ["it's", 'a\\b\n', '', 'x"y']) expect(conditionParts(conditionValue(text(value)))).toEqual(text(value))
  })
})
