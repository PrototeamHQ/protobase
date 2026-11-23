import { describe, expect, it } from 'vitest'
import { senderRowState } from './sender-address-state'

const at = (day: number) => new Date(Date.UTC(2026, 10, day))
const none = { typedAt: null, listedAt: null, providerState: null, providerStateReadAt: null, removedAt: null }

describe('senderRowState', () => {
  it('is unverified for a typed address no listing read', () => {
    expect(senderRowState({ ...none, typedAt: at(1) }, true)).toBe('unverified')
  })

  it('is verified or pending as the last listing says, and unverified for a listed address it makes no claim on', () => {
    const listed = { ...none, listedAt: at(2), providerStateReadAt: at(2) }
    expect(senderRowState({ ...listed, providerState: 'verified' }, true)).toBe('verified')
    expect(senderRowState({ ...listed, providerState: 'pending' }, true)).toBe('pending')
    expect(senderRowState(listed, true)).toBe('unverified')
  })

  it('makes no claim of a provider value it does not know', () => {
    expect(senderRowState({ ...none, listedAt: at(2), providerStateReadAt: at(2), providerState: 'accepted' }, true)).toBe('unverified')
    expect(senderRowState({ ...none, listedAt: at(2), providerStateReadAt: at(2), providerState: 'VERIFIED' }, true)).toBe('unverified')
  })

  it('is failed when a complete listing since did not hold it', () => {
    expect(senderRowState({ ...none, typedAt: at(1), providerStateReadAt: at(2) }, true)).toBe('failed')
  })

  it('is removed once its owner removed it, until they type it again', () => {
    expect(senderRowState({ ...none, typedAt: at(1), removedAt: at(2) }, true)).toBe('removed')
    expect(senderRowState({ ...none, listedAt: at(1), providerStateReadAt: at(1), providerState: 'verified', removedAt: at(2) }, true)).toBe('removed')
  })

  it('counts no listing older than the removal of an address typed again, so it is unverified until listed again', () => {
    const verifiedThenRemoved = { ...none, typedAt: at(3), listedAt: at(1), providerStateReadAt: at(1), providerState: 'verified', removedAt: at(2) }
    expect(senderRowState(verifiedThenRemoved, true)).toBe('unverified')
    expect(senderRowState({ ...verifiedThenRemoved, providerStateReadAt: at(4), listedAt: at(4) }, true)).toBe('verified')
  })

  it('is detached on no usable connection, whatever the provider said', () => {
    expect(senderRowState({ ...none, listedAt: at(1), providerStateReadAt: at(1), providerState: 'verified' }, false)).toBe('detached')
  })

  it('is verified by a proof where the provider makes no claim, never against what the provider says', () => {
    expect(senderRowState({ ...none, typedAt: at(1) }, true, at(2))).toBe('verified')
    expect(senderRowState({ ...none, listedAt: at(2), providerStateReadAt: at(2) }, true, at(3))).toBe('verified')
    expect(senderRowState({ ...none, typedAt: at(1), providerStateReadAt: at(2) }, true, at(3))).toBe('failed')
    expect(senderRowState({ ...none, listedAt: at(2), providerStateReadAt: at(2), providerState: 'pending' }, true, at(3))).toBe('pending')
    expect(senderRowState({ ...none, typedAt: at(1) }, false, at(2))).toBe('detached')
  })

  it('counts no proof from before the address was removed and typed again', () => {
    expect(senderRowState({ ...none, typedAt: at(3), removedAt: at(2) }, true, at(1))).toBe('unverified')
    expect(senderRowState({ ...none, typedAt: at(3), removedAt: at(2) }, true, at(4))).toBe('verified')
  })
})
