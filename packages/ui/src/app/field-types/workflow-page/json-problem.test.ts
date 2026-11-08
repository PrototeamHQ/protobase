import { describe, expect, it } from 'vitest'
import { jsonProblem } from './json-problem'

describe('jsonProblem', () => {
  it('is nothing for JSON', () => {
    expect(jsonProblem('{ "a": 1 }')).toBeUndefined()
  })

  it('names the line it stopped at', () => {
    // Browsers say where; the rest is said without a line
    expect(jsonProblem('{\n  "a": 1,\n  oops\n}')).toMatch(/^This is not valid JSON\.( Check line 3\.)?$/)
  })
})
