import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionModel } from '@protobase/schema'
import { actionFor, fillHref, linkTarget, openLink } from './action-href'

describe('fillHref', () => {
  it('fills fields from the record, percent-encoded', () => {
    expect(fillHref('https://maps.example/{orderId}?from={city}', { orderId: 42, city: 'Den Haag' })).toBe('https://maps.example/42?from=Den%20Haag')
  })

  it('leaves missing values empty and other braces alone', () => {
    expect(fillHref('https://pay.example/{plan}/{ nope }', { plan: null })).toBe('https://pay.example//{ nope }')
  })
})

describe('linkTarget', () => {
  it("opens the URL a field holds as it is, without encoding it, when it is an https: or http: URL", () => {
    expect(linkTarget('{website}', { website: 'https://www.homes.example/rent/a-b?ref=x&y=1' })).toBe('https://www.homes.example/rent/a-b?ref=x&y=1')
    expect(linkTarget('{website}', { website: 'http://homes.example/' })).toBe('http://homes.example/')
  })

  it('has no target for a field that holds no web URL', () => {
    expect(['', null, undefined, 42, 'homes.example/rent', '/rent/1', 'javascript:alert(1)', 'mailto:a@homes.example', 'data:text/html,x'].map((website) => linkTarget('{website}', { website }))).toEqual(
      Array(9).fill(undefined),
    )
    expect(linkTarget('{website}')).toBeUndefined()
  })

  it('fills any other href, percent-encoded', () => {
    expect(linkTarget('https://maps.example/{city}', { city: 'Den Haag' })).toBe('https://maps.example/Den%20Haag')
  })
})

describe('actionFor', () => {
  const source: ActionModel = { name: 'source', label: 'View on {host}', bulk: false, run: { kind: 'link', href: '{website}' } }

  it("shows a link to a record's URL only while the record holds one, its label naming the host without www.", () => {
    expect(actionFor(source, { website: 'https://www.homes.example/rent/1' })).toEqual({ ...source, label: 'View on homes.example' })
    expect(actionFor(source, { website: 'https://wwwhomes.example/' })?.label).toBe('View on wwwhomes.example')
    expect(actionFor(source, { website: 'ftp://homes.example/' })).toBeUndefined()
    expect(actionFor(source, undefined)).toBeUndefined()
  })

  it('leaves out an update on a record that holds its values already', () => {
    const markPaid: ActionModel = { name: 'markPaid', label: 'Mark as paid', bulk: false, run: { kind: 'update', values: { paid: true } } }
    expect(actionFor(markPaid, { paid: true })).toBeUndefined()
    expect(actionFor(markPaid, { paid: false })).toBe(markPaid)
    expect(actionFor(markPaid, {})).toBe(markPaid)
  })

  it('leaves every other action as it is', () => {
    const update: ActionModel = { name: 'ship', label: 'Ship to {host}', bulk: false, run: { kind: 'update', values: { status: 'shipped' } } }
    const mail: ActionModel = { name: 'mail', label: 'Mail', bulk: false, run: { kind: 'link', href: 'mailto:{email}' } }
    expect(actionFor(update, undefined)).toBe(update)
    expect(actionFor(mail, {})).toBe(mail)
  })
})

describe('openLink', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens a web page in a new tab without the opener or the referrer, and anything else in place', () => {
    const window = { open: vi.fn(), location: { assign: vi.fn() } }
    vi.stubGlobal('window', window)
    openLink('https://homes.example/rent/1')
    openLink('mailto:a@homes.example')
    openLink(undefined)
    expect(window.open).toHaveBeenCalledExactlyOnceWith('https://homes.example/rent/1', '_blank', 'noopener,noreferrer')
    expect(window.location.assign).toHaveBeenCalledExactlyOnceWith('mailto:a@homes.example')
  })
})
