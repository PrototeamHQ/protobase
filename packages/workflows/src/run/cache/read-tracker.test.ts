import { describe, expect, it } from 'vitest'
import { trackReads } from './read-tracker'

const input = () => ({ url: 'https://a.test', headers: { accept: 'json', user: 'u1' }, items: [1, 2], body: { a: { b: 1 }, c: 2 } })

describe('trackReads', () => {
  it('records the values read, and nothing else', () => {
    const tracked = trackReads(input())
    expect(tracked.input.url).toBe('https://a.test')
    expect(tracked.input.headers.user).toBe('u1')
    expect(tracked.paths()).toEqual([['headers', 'user'], ['url']])
  })

  it('counts serialising a value as reading all of it', () => {
    const tracked = trackReads(input())
    expect(JSON.stringify(tracked.input.body)).toBe('{"a":{"b":1},"c":2}')
    expect(tracked.paths()).toEqual([['body']])
  })

  it('records a whole object whose keys are listed, a whole array, and a key looked for', () => {
    const tracked = trackReads(input())
    expect(Object.keys(tracked.input.headers)).toEqual(['accept', 'user'])
    expect(tracked.input.items[0]).toBe(1)
    expect('missing' in tracked.input).toBe(false)
    expect(tracked.paths()).toEqual([['headers'], ['items'], ['missing']])
  })

  it('records a missing key it reads, and no prototype as a path into the input', () => {
    const tracked = trackReads(input() as Record<string, unknown>)
    expect(tracked.input.nothing).toBeUndefined()
    expect(Object.getPrototypeOf(tracked.input)).toBe(Object.prototype)
    expect(tracked.paths()).toEqual([['nothing']])
  })

  it('records the whole input once it is serialised', () => {
    const tracked = trackReads(input())
    void tracked.input.url
    JSON.stringify(tracked.input)
    expect(tracked.paths()).toEqual([[]])
  })
})
