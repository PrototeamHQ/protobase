import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { reactionsErrors, readsReactions } from './view-conversation-reactions'

const messages = resource('messages').table('messages').fields({ id: f.integer().readOnly().filterable(), body: f.text() }).primaryKey((r) => r.id).toModel()

const reactionsModel = resource('reactions')
  .table('reactions')
  .fields({ id: f.integer().readOnly(), message_id: f.relation('messages').filterable(), user_id: f.text().readOnly(), emoji: f.enum(['thumbs_up', 'heart']), note: f.integer() })
  .primaryKey((r) => r.id)
  .toModel()

const models = { messages, reactions: reactionsModel }
const labels = { thumbs_up: { symbol: '👍', name: 'Thumbs up' }, heart: { symbol: '❤️', name: 'Heart' } }
const reactions = { resource: 'reactions', field: 'message_id', user: 'user_id', emoji: 'emoji', labels }

describe('reactionsErrors', () => {
  it('takes a reaction resource pointing at the messages, with a label for each emoji', () => {
    expect(reactionsErrors(reactions, 'messages', models)).toEqual([])
  })

  it('names a missing resource, a wrong field and labels that do not match the emoji set', () => {
    expect(reactionsErrors({ ...reactions, resource: 'nope' }, 'messages', models)).toEqual(['unknown resource "nope"'])
    expect(reactionsErrors({ ...reactions, field: 'id', user: 'note', emoji: 'user_id' }, 'messages', models)).toEqual([
      'field: "id" on reactions is not filterable',
      'user: "note" is integer; it holds the user id of the person who reacted',
      'emoji: "user_id" is text; the emoji set is the values of an enum field',
    ])
    expect(reactionsErrors({ ...reactions, labels: { thumbs_up: labels.thumbs_up, party: { symbol: '🎉', name: '' } } }, 'messages', models)).toEqual([
      'labels: no label for "heart"',
      'labels: "party" is no value of the emoji field',
      'labels: "party" needs a symbol and a name',
    ])
  })
})

describe('readsReactions', () => {
  it('holds only for a caller who reads the resource and each field the reactions show', () => {
    expect(readsReactions(reactions, models)).toBe(true)
    expect(readsReactions(reactions, { messages })).toBe(false)
    const { user_id: _, ...fields } = reactionsModel.fields
    expect(readsReactions(reactions, { messages, reactions: { ...reactionsModel, fields } })).toBe(false)
  })
})
