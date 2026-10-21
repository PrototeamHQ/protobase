import { describe, expect, it } from 'vitest'
import type { ApplyResult } from '@protobase/server'
import { printApply } from './print-apply'

const printed = (result: ApplyResult) => {
  let text = ''
  const unreadable = printApply(result, (chunk) => { text += chunk })
  return { text, unreadable }
}

const field = { resource: 'people', field: 'iban', encrypted: 2, reencrypted: 1, rebound: 0, skipped: 1, unreadable: [], historyScrubbed: 3, outboxScrubbed: 0 }

describe('protobase encryption apply', () => {
  it('prints the counts of each field', () => {
    expect(printed({ kid: 'AAAAAAAA', fields: [field], warnings: [] })).toEqual({
      text: 'people.iban: 2 encrypted, 1 re-encrypted, 0 rebound, 1 skipped, 0 unreadable; old values removed from 3 history rows and 0 undispatched changes\n',
      unreadable: false,
    })
  })

  it('lists values that do not open, without their value', () => {
    const { text, unreadable } = printed({ kid: 'AAAAAAAA', fields: [{ ...field, unreadable: [{ key: ['A', 'x'], kid: 'CCCCCCCC', kind: 'unknown-key' }] }], warnings: [] })
    expect(unreadable).toBe(true)
    expect(text).toContain('  people.iban ["A","x"]: unknown-key [key CCCCCCCC]\n')
    expect(text).not.toContain('Values fail authentication')
  })
})
