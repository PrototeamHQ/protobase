import { describe, expect, it } from 'vitest'
import { f, resource, type RelatedModel } from '@protobase/schema'
import { relatedCardErrors } from './view-related-cards'

const causes = resource('causes')
  .table('causes')
  .fields({ id: f.integer(), title: f.text(), state: f.enum(['open', 'held']), since: f.timestamp(), due: f.date(), note: f.text(), secret: f.enum(['a']).sensitive() })
  .primaryKey((r) => r.id)
  .toModel()

const section = (o: Partial<RelatedModel>): RelatedModel => ({ kind: 'related', title: 'Causes', resource: 'causes', field: 'objective_id', ...o })

describe('relatedCardErrors', () => {
  it('accepts a time on compact cards and a tone on cards of either kind', () => {
    expect(relatedCardErrors(section({ presentation: 'compact', time: 'since', tone: 'state' }), causes)).toEqual([])
    expect(relatedCardErrors(section({ presentation: 'compact', time: 'due' }), causes)).toEqual([])
    expect(relatedCardErrors(section({ presentation: 'cards', tone: 'state' }), causes)).toEqual([])
  })

  it('refuses them on a presentation that draws no such card', () => {
    expect(relatedCardErrors(section({ presentation: 'cards', time: 'since' }), causes)).toEqual(['time needs presentation "compact"'])
    expect(relatedCardErrors(section({ tone: 'state' }), causes)).toEqual(['tone needs presentation "cards" or "compact"'])
    expect(relatedCardErrors(section({ presentation: 'record', tone: 'state' }), causes)).toEqual(['tone needs presentation "cards" or "compact"'])
  })

  it('names a field that is unknown, sensitive or of the wrong type', () => {
    expect(relatedCardErrors(section({ presentation: 'compact', time: 'nope', tone: 'nope' }), causes)).toEqual(['time: unknown field "nope" on causes', 'tone: unknown field "nope" on causes'])
    expect(relatedCardErrors(section({ presentation: 'compact', tone: 'secret' }), causes)).toEqual(['tone: "secret" on causes is sensitive'])
    expect(relatedCardErrors(section({ presentation: 'compact', time: 'note', tone: 'since' }), causes)).toEqual(['time: "note" on causes is not a date or timestamp', 'tone: "since" on causes is not an enum'])
  })
})
