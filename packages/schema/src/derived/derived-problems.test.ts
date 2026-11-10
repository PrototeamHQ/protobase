import { describe, expect, it } from 'vitest'
import { f } from '../fields'
import { resource } from '../resource'

const objectives = resource('objectives').table('objectives').fields({ id: f.integer().readOnly(), verdict: f.text().optional().readOnly(), title: f.text() }).primaryKey((r) => r.id)

describe('.derived()', () => {
  it('keeps where the value goes and what it reads in the model', () => {
    const model = objectives.derived('verdict', { into: (r) => r.verdict, reads: ['tasks'] }).toModel()
    expect(model.derived).toEqual([{ name: 'verdict', into: { resource: 'objectives', field: 'verdict' }, reads: ['tasks'] }])
  })

  it('takes a job and no automatic tracking', () => {
    const model = objectives.derived('late', { job: 'notify-late', track: false }).toModel()
    expect(model.derived).toEqual([{ name: 'late', job: 'notify-late', reads: [], track: false }])
  })

  it('refuses a field the API writes, a value with nowhere to go and a name used twice', () => {
    expect(() => objectives.derived('verdict', { into: (r) => r.title }).toModel()).toThrow('goes into "title", which must be readOnly()')
    expect(() => objectives.derived('verdict', {}).toModel()).toThrow('needs `into`, `job` or both')
    expect(() => objectives.derived('a', { job: 'x' }).derived('a', { job: 'y' }).toModel()).toThrow('derived value "a" is declared twice')
  })
})
