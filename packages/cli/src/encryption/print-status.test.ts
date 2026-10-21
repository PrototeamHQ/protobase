import { describe, expect, it } from 'vitest'
import type { EncryptionStatus } from '@protobase/server'
import { printStatus } from './print-status'

const clean: EncryptionStatus = {
  kid: 'AAAAAAAA',
  fields: [{ resource: 'people', field: 'iban', byKey: { AAAAAAAA: 3 }, plaintext: 0, unreadable: [], history: 0, outbox: 0 }],
  stray: [],
  cascading: [],
}

const printed = (status: EncryptionStatus) => {
  let text = ''
  const dirty = printStatus(status, (chunk) => { text += chunk })
  return { text, dirty }
}

describe('protobase encryption status', () => {
  it('counts values by key and needs nothing when all are under the current one', () => {
    expect(printed(clean)).toEqual({ text: 'Current key AAAAAAAA\npeople.iban: 3 under key AAAAAAAA (current), 0 plaintext, 0 unreadable\n', dirty: false })
  })

  it('lists unreadable values by key, explains failed authentication, and needs work', () => {
    const status: EncryptionStatus = {
      ...clean,
      fields: [{ ...clean.fields[0]!, byKey: { AAAAAAAA: 1, BBBBBBBB: 2 }, plaintext: 1, unreadable: [{ key: ['7'], kid: 'AAAAAAAA', kind: 'failed-authentication' }, { key: ['8'], kind: 'malformed' }], history: 2, outbox: 0 }],
      stray: [{ resource: 'people', field: 'note', count: 1 }],
      cascading: [{ resource: 'people', constraint: 'people_id_fkey' }],
    }
    const { text, dirty } = printed(status)
    expect(dirty).toBe(true)
    expect(text).toBe([
      'Current key AAAAAAAA',
      'people.iban: 1 under key AAAAAAAA (current), 2 under key BBBBBBBB, 1 plaintext, 2 unreadable',
      '  people.iban ["7"]: failed-authentication [key AAAAAAAA]',
      '  people.iban ["8"]: malformed',
      '  old values left in 2 history rows and 0 undispatched changes',
      'people.note is not encrypted but holds 1 encrypted value',
      "warning: people's key changes with another record's through foreign key people_id_fkey, which makes its encrypted values unreadable",
      "Values fail authentication when their table or column was renamed or moved (protobase encryption apply --rebind), the resource's key or tenant field changed, their record's key changed in the database, or they were copied there by SQL.",
      '',
    ].join('\n'))
  })

  it('needs work for values under a previous key only', () => {
    expect(printed({ ...clean, fields: [{ ...clean.fields[0]!, byKey: { BBBBBBBB: 1 } }] }).dirty).toBe(true)
  })
})
