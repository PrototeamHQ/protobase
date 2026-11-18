import { describe, expect, it } from 'vitest'
import { readUnsubscribeToken, signUnsubscribeToken, unsubscribeKey } from './unsubscribe-token'

const key = unsubscribeKey('test secret')
const target = { recipient: 'ada@example.com', topic: 'newsletter' }

// The token with its payload swapped for another target's, its signature kept.
const withPayloadOf = (token: string, other: typeof target) => `${signUnsubscribeToken(key, other).split('.')[0]}.${token.split('.')[1]}`

describe('unsubscribe tokens', () => {
  it('read back the recipient, lower-cased, and the topic they were signed for', () => {
    expect(readUnsubscribeToken(key, signUnsubscribeToken(key, { recipient: 'Ada@Example.com', topic: 'newsletter' }))).toEqual(target)
  })

  it('refuse a changed recipient or topic', () => {
    const token = signUnsubscribeToken(key, target)
    expect(readUnsubscribeToken(key, withPayloadOf(token, { ...target, recipient: 'bob@example.com' }))).toBeUndefined()
    expect(readUnsubscribeToken(key, withPayloadOf(token, { ...target, topic: 'digest' }))).toBeUndefined()
  })

  it('refuse a changed signature, one of another secret, and what is no token', () => {
    const token = signUnsubscribeToken(key, target)
    const signature = token.split('.')[1]!
    expect(readUnsubscribeToken(key, `${token.split('.')[0]}.${signature.slice(0, -2)}AA`)).toBeUndefined()
    expect(readUnsubscribeToken(key, signUnsubscribeToken(unsubscribeKey('another secret'), target))).toBeUndefined()
    for (const garbage of ['', 'abc', `${token}.extra`, `.${signature}`]) expect(readUnsubscribeToken(key, garbage)).toBeUndefined()
  })

  it('are safe in a URL path', () => {
    expect(signUnsubscribeToken(key, target)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })
})
