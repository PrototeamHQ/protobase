import { describe, expect, it } from 'vitest'
import { parseEmbedParams, splitEmbedKey } from './embed-params'
import { parseSelect } from './parse-select'

describe('splitEmbedKey', () => {
  it('splits a key into the embed path and its own name', () => {
    expect(splitEmbedKey('priority')).toEqual({ name: 'priority' })
    expect(splitEmbedKey('not.or')).toEqual({ name: 'not.or' })
    expect(splitEmbedKey('comments.likes')).toEqual({ path: 'comments', name: 'likes' })
    expect(splitEmbedKey('comments.author.username')).toEqual({ path: 'comments.author', name: 'username' })
    expect(splitEmbedKey('comments.not.and')).toEqual({ path: 'comments', name: 'not.and' })
    expect(splitEmbedKey('comments.meta->>a.b')).toEqual({ path: 'comments', name: 'meta->>a.b' })
    expect(splitEmbedKey('meta->>a.b')).toEqual({ name: 'meta->>a.b' })
  })
})

describe('parseEmbedParams', () => {
  const select = parseSelect('id,comments(id,author:profiles(username))')

  it('gives each embed its filters, order and range, by path and alias', () => {
    const params = parseEmbedParams([['comments.likes', 'gte.2'], ['comments.or', '(likes.eq.0,likes.gte.5)'], ['comments.order', 'id.desc'], ['comments.limit', '1'], ['comments.offset', '2'], ['comments.author.username', 'eq.bob'], ['id', 'eq.1']], select)
    expect([...params.keys()]).toEqual(['comments', 'comments.author'])
    expect(params.get('comments')).toMatchObject({ filters: [{ kind: 'condition', operator: 'gte' }, { kind: 'or' }], order: [{ direction: 'desc' }], range: { offset: 2, limit: 1 } })
    expect(params.get('comments.author')).toMatchObject({ filters: [{ field: { column: 'username' }, value: 'bob' }], order: [], range: { offset: 0 } })
  })

  it('refuses a path no embed has, as PGRST108', () => {
    expect(() => parseEmbedParams([['profiles.username', 'eq.bob']], select)).toThrow("'profiles' is not an embedded resource in this request")
    expect(() => parseEmbedParams([['comments.limit', 'x']], select)).toThrow()
  })
})
