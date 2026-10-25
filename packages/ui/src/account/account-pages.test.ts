import { describe, expect, it } from 'vitest'
import { accountMenuItems, accountTabPath, readAccountPath } from './account-pages'

describe('accountMenuItems', () => {
  it('offers everyone their own account, and admins the policy too, marking the open one', () => {
    expect(accountMenuItems('/admin', '/orders', false).map((item) => [item.label, item.href, item.active])).toEqual([['Account', '/admin/-/account', false]])
    expect(accountMenuItems('', '/-/sign-in-policy', true).map((item) => [item.label, item.href, item.active])).toEqual([
      ['Account', '/-/account', false],
      ['Sign-in policy', '/-/sign-in-policy', true],
    ])
  })

  it('marks the account open on any of its tabs', () => {
    expect(accountMenuItems('', '/-/account/security', false)[0]?.active).toBe(true)
  })
})

describe('readAccountPath', () => {
  it('reads the account page and the tab below it', () => {
    expect(readAccountPath('/-/account')).toEqual({})
    expect(readAccountPath('/-/account/security')).toEqual({ tab: 'security' })
    expect(readAccountPath(accountTabPath('two words'))).toEqual({ tab: 'two words' })
  })

  it('leaves out every other path', () => {
    for (const path of ['/', '/account', '/-/accounts', '/-/account/', '/-/account/a/b', '/-/account/%E0%A4%A']) expect(readAccountPath(path)).toBeUndefined()
  })
})
