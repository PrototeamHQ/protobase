import { describe, expect, it } from 'vitest'
import { mergeByTime } from './merge-by-time'

const at = (name: string, minute: number | undefined) => ({ name, time: minute === undefined ? undefined : `2026-11-10T09:${String(minute).padStart(2, '0')}:00Z` })
const names = (items: { name: string }[]) => items.map((item) => item.name)

describe('mergeByTime', () => {
  it('merges two newest-first lists into one newest first', () => {
    const calls = { items: [at('call 2', 2)], more: false }
    const messages = { items: [at('message 3', 3), at('message 1', 1)], more: false }
    expect(names(mergeByTime(calls, messages))).toEqual(['message 3', 'call 2', 'message 1'])
  })

  it('takes an item of the first list as the newer of two at the same time', () => {
    expect(names(mergeByTime({ items: [at('call', 1)], more: false }, { items: [at('message', 1)], more: false }))).toEqual(['call', 'message'])
  })

  it('holds back what is older than a list’s oldest loaded item while that list has earlier ones left', () => {
    const calls = { items: [at('call 5', 5), at('call 4', 4)], more: true }
    const messages = { items: [at('message 6', 6), at('message 3', 3), at('message 1', 1)], more: false }
    expect(names(mergeByTime(calls, messages))).toEqual(['message 6', 'call 5', 'call 4'])
    expect(names(mergeByTime({ ...calls, more: false }, messages))).toEqual(['message 6', 'call 5', 'call 4', 'message 3', 'message 1'])
  })

  it('takes an item without a time as the newest', () => {
    expect(names(mergeByTime({ items: [at('call', undefined)], more: false }, { items: [at('message', 9)], more: true }))).toEqual(['call', 'message'])
  })
})
