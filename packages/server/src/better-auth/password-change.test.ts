import { describe, expect, it } from 'vitest'
import { changedAccount } from './password-change'

const own = (path: string, returned: unknown = { status: true }) => ({ path, body: {}, context: { session: { user: { email: 'ana@example.com' } }, returned } })

describe('whose new password a finished request mails about', () => {
  it("is the person's own after a change or a first password", () => {
    expect(changedAccount(own('/change-password'))).toEqual({ email: 'ana@example.com' })
    expect(changedAccount(own('/account/set-password'))).toEqual({ email: 'ana@example.com' })
  })

  it('is the user an admin set the password of', () => {
    expect(changedAccount({ path: '/admin/set-user-password', body: { userId: 'bo', newPassword: 'x' }, context: { session: null, returned: { status: true } } })).toEqual({ userId: 'bo' })
  })

  it('is nobody when the request failed, or for another request', () => {
    expect(changedAccount(own('/change-password', new Error('INVALID_PASSWORD')))).toBeUndefined()
    expect(changedAccount(own('/update-user'))).toBeUndefined()
  })
})
