import { describe, expect, it } from 'vitest'
import { mergePatch } from './merge-patch'

describe('mergePatch', () => {
  it('changes one field of one state and leaves the rest as it was', () => {
    const target = { States: { A: { Type: 'Task', Arguments: { url: 'a', method: 'GET' }, Next: 'B' }, B: { Type: 'Succeed' } } }
    expect(mergePatch(target, { States: { A: { Arguments: { url: 'b' } } } })).toEqual({ States: { A: { Type: 'Task', Arguments: { url: 'b', method: 'GET' }, Next: 'B' }, B: { Type: 'Succeed' } } })
    expect(target.States.A.Arguments.url).toBe('a')
  })

  it('removes a member set to null, and replaces lists and plain values whole', () => {
    expect(mergePatch({ A: { Next: 'B', Retry: [{ x: 1 }, { y: 2 }] }, B: {} }, { A: { Next: null, End: true, Retry: [{ z: 3 }] }, B: null })).toEqual({ A: { End: true, Retry: [{ z: 3 }] } })
  })

  it('replaces a value that is not an object with the patch, and a whole value with a patch that is not one', () => {
    expect(mergePatch('text', { a: 1 })).toEqual({ a: 1 })
    expect(mergePatch({ a: 1 }, [1])).toEqual([1])
  })
})
