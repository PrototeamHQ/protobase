import { describe, expect, it } from 'vitest'
import { accountMenuItems } from './account-pages'

describe('accountMenuItems', () => {
  it('offers everyone their own sign-in, and admins the policy too, marking the open one', () => {
    expect(accountMenuItems('/admin', '/orders', false).map((item) => [item.label, item.href, item.active])).toEqual([['Sign-in & security', '/admin/-/account', false]])
    expect(accountMenuItems('', '/-/sign-in-policy', true).map((item) => [item.label, item.href, item.active])).toEqual([
      ['Sign-in & security', '/-/account', false],
      ['Sign-in policy', '/-/sign-in-policy', true],
    ])
  })
})
