import { describe, expect, it } from 'vitest'
import { matchingMembers, mentionListSize } from './member-search'

const members = [
  { id: 'u-maya', name: 'Maya Jansen' },
  { id: 'u-sam', name: 'Sam Okafor' },
  { id: 'u-sanne', name: 'Sanne de Vries' },
]

describe('matchingMembers', () => {
  it('lists the members whose name holds the text, ignoring case, but not the writer', () => {
    expect(matchingMembers(members, 'sa', 'u-maya')).toEqual([members[1], members[2]])
    expect(matchingMembers(members, 'JANS', 'u-sam')).toEqual([members[0]])
    expect(matchingMembers(members, '', 'u-maya')).toEqual([members[1], members[2]])
  })

  it('lists a few at most', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ id: `u-${index}`, name: `Person ${index}` }))
    expect(matchingMembers(many, 'person', undefined)).toHaveLength(mentionListSize)
  })
})
