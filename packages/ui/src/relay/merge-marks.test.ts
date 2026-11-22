import { describe, expect, it } from 'vitest'
import type { NavRecord } from '../app-shell/nav'
import { mergeMarks } from './use-relay-marks'

const records: NavRecord[] = [{ id: '7', label: 'General', href: '/conversations/7', active: false }]

describe('mergeMarks', () => {
  it("puts the relay's marks over the app's, keeping both labels", () => {
    const merged = mergeMarks(() => ({ 7: { person: 'u2', label: 'Away' } }), () => ({ 7: { strong: true, count: 2, label: '2 unread messages', typing: true } }))!
    expect(merged(records)).toEqual({ 7: { person: 'u2', strong: true, count: 2, typing: true, label: 'Away, 2 unread messages' } })
  })

  it('is either hook alone when the other is missing or answers nothing', () => {
    const one = () => ({ 7: { strong: true } })
    expect(mergeMarks(one, undefined)).toBe(one)
    expect(mergeMarks(undefined, undefined)).toBeUndefined()
    expect(mergeMarks(() => undefined, one)!(records)).toEqual({ 7: { strong: true } })
  })
})
