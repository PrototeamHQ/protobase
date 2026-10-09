import { describe, expect, it } from 'vitest'
import { userMenu } from './user-menu'

describe('userMenu', () => {
  it('builds resource and link items in order', () => {
    const menu = userMenu((m) => [m.resource('organizations', { label: 'Organization', icon: 'building' }), m.resource('users'), m.link('Support', 'mailto:help@example.test', { icon: 'life-buoy' })])
    expect(menu.toUserMenuModel()).toEqual({
      items: [
        { kind: 'resource', resource: 'organizations', label: 'Organization', icon: 'building' },
        { kind: 'resource', resource: 'users' },
        { kind: 'link', label: 'Support', href: 'mailto:help@example.test', icon: 'life-buoy' },
      ],
    })
  })

  it('builds page items', () => {
    expect(userMenu((m) => [m.page('billing', { label: 'Billing', icon: 'credit-card' }), m.page('support')]).toUserMenuModel().items).toEqual([
      { kind: 'page', page: 'billing', label: 'Billing', icon: 'credit-card' },
      { kind: 'page', page: 'support' },
    ])
  })

  it('hands out a copy, so callers cannot change the menu', () => {
    const menu = userMenu((m) => [m.resource('users')])
    menu.toUserMenuModel().items.pop()
    expect(menu.toUserMenuModel().items).toHaveLength(1)
  })

  it('accepts only web and mail links', () => {
    expect(() => userMenu((m) => [m.link('Docs', 'https://docs.example.test')])).not.toThrow()
    expect(() => userMenu((m) => [m.link('Bad', 'javascript:alert(1)')])).toThrow('href must start with https://, http:// or mailto:')
    expect(() => userMenu((m) => [m.link('Relative', '/orders')])).toThrow('href must start with')
  })
})
