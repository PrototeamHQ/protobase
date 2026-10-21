import { describe, expect, it } from 'vitest'
import { parsePrefer } from './parse-prefer'

describe('parsePrefer', () => {
  it('reads what /api/sb/rest/v1 does from one header or several joined, the first of each kind counting', () => {
    expect(parsePrefer('return=representation, count=exact,resolution=merge-duplicates,missing=default')).toEqual({ return: 'representation', count: 'exact', resolution: 'merge-duplicates', missing: 'default' })
    expect(parsePrefer('return=minimal,return=representation')).toEqual({ return: 'minimal' })
  })

  it('leaves out what it does not know, as PostgREST does by default', () => {
    expect(parsePrefer(null)).toEqual({})
    expect(parsePrefer('tx=rollback, handling=lenient, count=some, return')).toEqual({})
  })
})
