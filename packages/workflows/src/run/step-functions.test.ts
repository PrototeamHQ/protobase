import { describe, expect, it } from 'vitest'
import { compile } from '../definition/expressions'
import { stepFunctions } from './step-functions'

const evaluate = (source: string, key: string, clock = new Date('2026-11-04T12:30:00Z')) => compile(source).evaluate(undefined, stepFunctions(clock, key))

describe('stepFunctions', () => {
  it("gives $now and $millis the scope's clock, formatted as JSONata's own $now formats it", async () => {
    expect(await evaluate('$now()', 'a')).toBe('2026-11-04T12:30:00.000Z')
    expect(await evaluate("$now('[Y0001]-[M01]-[D01] [H01]:[m01]', '+0100')", 'a')).toBe('2026-11-04 13:30')
    expect(await evaluate('$millis()', 'a')).toBe(Date.parse('2026-11-04T12:30:00Z'))
  })

  it('draws the same $random and $shuffle for the same key, and others for another', async () => {
    const draw = '[$random(), $random(), $shuffle([1, 2, 3, 4, 5, 6, 7, 8])]'
    const first = await evaluate(draw, 'run/Each.0[0]/0/1')
    expect(await evaluate(draw, 'run/Each.0[0]/0/1')).toEqual(first)
    expect(await evaluate(draw, 'run/Each.0[1]/0/1')).not.toEqual(first)
    expect((first as number[]).slice(0, 2).every((value) => value >= 0 && value < 1)).toBe(true)
  })
})
