import { appPath, type AppAddress } from '@protobase/schema'
import { describe, expect, it, vi } from 'vitest'
import { actionLink } from './action-link'

const addresses = () => ({ href: (to: AppAddress) => `/base${appPath(to)}`, go: vi.fn() })

describe('actionLink', () => {
  it('links to the app address filled from the record, and follows it in place', () => {
    const app = addresses()
    const link = actionLink({ kind: 'link', to: { kind: 'create', resource: 'vms', values: { template: '{id}' } } }, { id: 7 }, app)
    const filled: AppAddress = { kind: 'create', resource: 'vms', values: { template: '7' } }
    expect(link.href).toBe(`/base${appPath(filled)}`)
    expect(link.newTab).toBeUndefined()
    link.onFollow?.()
    expect(app.go).toHaveBeenCalledWith(filled)
  })

  it('opens an https href in a new tab and leaves it to the browser', () => {
    expect(actionLink({ kind: 'link', href: 'https://shop.example/orders/{id}' }, { id: 'a b' }, addresses())).toEqual({ href: 'https://shop.example/orders/a%20b', newTab: true })
  })

  it('opens a mailto href in place', () => {
    expect(actionLink({ kind: 'link', href: 'mailto:{email}' }, { email: 'a@example.test' }, addresses())).toEqual({ href: 'mailto:a%40example.test', newTab: false })
  })

  it('refuses a link whose record has no URL, which is never shown', () => {
    expect(() => actionLink({ kind: 'link', href: '{website}' }, { website: null }, addresses())).toThrow()
  })
})
