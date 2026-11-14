import { describe, expect, it } from 'vitest'
import { valueProblems } from './value-check'

describe('valueProblems', () => {
  it('names where a value does not fit a schema, and says so of a schema that does not compile', () => {
    const schema = { type: 'object', properties: { ip: { type: 'string' } } }
    expect(valueProblems(schema, { ip: '1.2.3.4' }, 'body')).toEqual([])
    expect(valueProblems(schema, { ip: 4 }, 'body')).toEqual(['body.ip must be string'])
    // The same schema object again compiles again rather than from a cache that would keep every one
    expect(valueProblems(schema, { ip: 5 }, 'body')).toEqual(['body.ip must be string'])
    expect(valueProblems({ type: 'nonsense' }, {})[0]).toMatch(/^the schema is not valid JSON Schema/)
  })
})
