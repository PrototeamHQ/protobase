import { describe, expect, it } from 'vitest'
import { signedInUserOf } from './use-signed-in-user'

describe('signedInUserOf', () => {
  const user = { id: 'u1', email: 'ann@example.com', name: 'Ann' }

  it('gives the id and name of someone signed in, without their address', () => {
    expect(signedInUserOf({ kind: 'signed-in', user })).toEqual({ id: 'u1', name: 'Ann' })
    expect(signedInUserOf({ kind: 'signed-in', user: { ...user, name: '' } })).toEqual({ id: 'u1' })
  })

  it('gives nobody before the sign-in finished, for a visitor, or outside the auth provider', () => {
    expect(signedInUserOf({ kind: 'loading' })).toBeUndefined()
    expect(signedInUserOf({ kind: 'visitor' })).toBeUndefined()
    expect(signedInUserOf({ kind: 'setup-required', user, missing: [] })).toBeUndefined()
    expect(signedInUserOf(undefined)).toBeUndefined()
  })
})
