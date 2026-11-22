import { describe, expect, it } from 'vitest'
import { sameAddress, senderLabel, senderOptions } from './sender-options'

describe('senderOptions', () => {
  it("lists the mailbox's own address first, then the entered ones with their names", () => {
    const senders = [{ id: '1', address: 'billing@acme.example', name: 'Acme billing', isDefault: false, verified: false, shared: false }, { id: '2', address: 'sales@acme.example', isDefault: true, verified: false, shared: false }]
    expect(senderOptions({ address: 'Ana@Gmail.example', senders })).toEqual([{ address: 'Ana@Gmail.example' }, { address: 'billing@acme.example', name: 'Acme billing' }, { address: 'sales@acme.example' }])
  })

  it("lists the mailbox's own address once when it was entered too, and leaves it out when the link names none", () => {
    const senders = [{ id: '1', address: 'ana@gmail.example', name: 'Ana', isDefault: false, verified: false, shared: false }]
    expect(senderOptions({ address: 'Ana@Gmail.example', senders })).toEqual([{ address: 'ana@gmail.example', name: 'Ana' }])
    expect(senderOptions({ senders: [] })).toEqual([])
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
