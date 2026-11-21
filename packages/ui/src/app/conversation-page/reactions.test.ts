import { describe, expect, it } from 'vitest'
import { emojiSet, reactionGroups, reactionsByMessage } from './reactions'

const labels = { heart: { symbol: '❤️', name: 'Heart' }, thumbs_up: { symbol: '👍', name: 'Thumbs up' } }
const set = emojiSet({ labels }, ['thumbs_up', 'heart'])
const fields = { user: 'user_id', emoji: 'emoji' }

const rows = [
  { id: 1, message_id: 5, user_id: 'u-sam', emoji: 'heart' },
  { id: 2, message_id: 5, user_id: 'u-maya', emoji: 'heart' },
  { id: 3, message_id: 5, user_id: 'u-lin', emoji: 'thumbs_up' },
  { id: 4, message_id: 6, user_id: 'u-lin', emoji: 'heart' },
]

describe('emojiSet', () => {
  it("offers the emoji field's values in their order, each with its label", () => {
    expect(set.map((entry) => entry.emoji)).toEqual(['thumbs_up', 'heart'])
    expect(set[0]).toEqual({ emoji: 'thumbs_up', symbol: '👍', name: 'Thumbs up' })
  })
})

describe('reactionsByMessage', () => {
  it('groups the rows by the message they answer', () => {
    const byMessage = reactionsByMessage(rows, 'message_id')
    expect(byMessage.get('5')).toHaveLength(3)
    expect(byMessage.get('6')).toEqual([rows[3]])
  })
})

describe('reactionGroups', () => {
  it("counts each emoji once, in the set's order, with who reacted and the reader's own", () => {
    const groups = reactionGroups(reactionsByMessage(rows, 'message_id').get('5')!, fields, set, 'u-maya')
    expect(groups).toEqual([
      { emoji: 'thumbs_up', symbol: '👍', name: 'Thumbs up', count: 1, userIds: ['u-lin'], mine: undefined },
      { emoji: 'heart', symbol: '❤️', name: 'Heart', count: 2, userIds: ['u-sam', 'u-maya'], mine: rows[1] },
    ])
  })

  it('leaves out an emoji nobody reacted with', () => {
    expect(reactionGroups([rows[3]!], fields, set, 'u-maya').map((group) => group.emoji)).toEqual(['heart'])
  })
})
