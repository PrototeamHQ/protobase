import { describe, expect, it } from 'vitest'
import { sameAddress, senderLabel, senderOptions } from './sender-options'

describe('senderOptions', () => {
  it("lists the mailbox's own address first, then the entered ones with their names", () => {
    const senders = [{ id: '1', address: 'billing@acme.example', name: 'Acme billing', isDefault: false, state: 'verified' as const }, { id: '2', address: 'sales@acme.example', isDefault: true, state: 'unverified' as const }]
    expect(senderOptions({ address: 'Ana@Gmail.example', senders })).toEqual([{ address: 'Ana@Gmail.example' }, { address: 'billing@acme.example', name: 'Acme billing', state: 'verified' }, { address: 'sales@acme.example', state: 'unverified' }])
  })

  it("lists the mailbox's own address once when it was entered too, and leaves it out when the link names none", () => {
    const senders = [{ id: '1', address: 'ana@gmail.example', name: 'Ana', isDefault: false, state: 'verified' as const }]
    expect(senderOptions({ address: 'Ana@Gmail.example', senders })).toEqual([{ address: 'ana@gmail.example', name: 'Ana', state: 'verified' }])
    expect(senderOptions({ senders: [] })).toEqual([])
  })

  it('leaves out an address on no mailbox, and lists one on two mailboxes once', () => {
    const senders = [
      { id: '1', address: 'old@acme.example', isDefault: false, state: 'detached' as const },
      { id: '2', address: 'billing@acme.example', isDefault: false, state: 'verified' as const },
      { id: '3', address: 'Billing@acme.example', isDefault: false, state: 'unverified' as const },
    ]
    expect(senderOptions({ senders })).toEqual([{ address: 'billing@acme.example', state: 'verified' }])
  })
})

describe('senderLabel', () => {
  it('shows the display name before the address, as a From header does', () => {
    expect(senderLabel({ address: 'billing@acme.example', name: 'Acme billing' })).toBe('Acme billing <billing@acme.example>')
    expect(senderLabel({ address: 'billing@acme.example' })).toBe('billing@acme.example')
  })
})

describe('sameAddress', () => {
  it('matches addresses without regard to case or surrounding blanks', () => {
    expect(sameAddress(' Ana@Gmail.example', 'ana@gmail.example')).toBe(true)
    expect(sameAddress('ana@gmail.example', 'bo@gmail.example')).toBe(false)
  })
})
