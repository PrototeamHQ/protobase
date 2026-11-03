import { describe, expect, it } from 'vitest'
import { nameProblem } from './names'

describe('nameProblem', () => {
  it('takes lowercase names of letters, digits and "_" starting with a letter, up to 63 bytes', () => {
    expect(nameProblem('notes', 'table')).toBeUndefined()
    expect(nameProblem('due_at_2', 'field')).toBeUndefined()
    expect(nameProblem('n'.repeat(63), 'table')).toBeUndefined()
  })
  it.each([`a"b`, 'a;b', 'a.b', 'a b', 'A', '_a', '1a', 'é', '', 'n'.repeat(64), 7, null])('refuses %j', (name) => {
    expect(nameProblem(name, 'table')).toMatch('Use lowercase letters')
  })
  it('refuses a reserved word, and for a field the key and the record version', () => {
    expect(nameProblem('select', 'table')).toBe('"select" is a word SQL reserves')
    expect(nameProblem('id', 'table')).toBeUndefined()
    expect(nameProblem('id', 'field')).toMatch('every table has')
    expect(nameProblem('etag', 'field')).toMatch('every table has')
  })
})
