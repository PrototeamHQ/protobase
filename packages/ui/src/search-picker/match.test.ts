import { describe, expect, it } from 'vitest'
import { matchingGroups } from './match'

const groups = [
  { title: 'Built in', items: [{ id: 'http', title: 'HTTP request', description: 'Call a URL' }, { id: 'mail', title: 'Send mail', keywords: ['email'] }] },
  { title: 'Flow', items: [{ id: 'choice', title: 'Choice', keywords: ['if', 'branch'] }] },
]

describe('matchingGroups', () => {
  it('finds by title, description and keywords, every word, in any case', () => {
    expect(matchingGroups(groups, 'EMAIL')).toEqual([{ title: 'Built in', items: [groups[0]!.items[1]] }])
    expect(matchingGroups(groups, 'call url').flatMap((group) => group.items.map((item) => item.id))).toEqual(['http'])
  })

  it('puts what the query names by title before what it only meets in a description', () => {
    const samples = [
      { title: 'First', items: [{ id: 'a', title: 'All of it', description: '{"email":"ada@example.com"}' }] },
      { title: 'Second', items: [{ id: 'b', title: 'All of it', description: '{"email":"ada@example.com"}' }, { id: 'c', title: 'email', description: 'ada@example.com' }] },
    ]
    expect(matchingGroups(samples, 'email').flatMap((group) => group.items.map((item) => item.id))).toEqual(['c', 'b', 'a'])
  })

  it('drops a group left empty, and keeps all with no query', () => {
    expect(matchingGroups(groups, 'if').map((group) => group.title)).toEqual(['Flow'])
    expect(matchingGroups(groups, '  ')).toEqual(groups)
  })
})
