import { describe, expect, it } from 'vitest'
import { addressPlaceholders, appHrefError, fillAddress, hrefField, hrefPlaceholders, leavesApp, linkActionError } from './address-template'

describe('fillAddress', () => {
  it('fills a record key and a list filter and order from the record', () => {
    expect(fillAddress({ kind: 'record', resource: 'orders', key: '{orderId}' }, { orderId: 42 })).toEqual({ kind: 'record', resource: 'orders', key: '42' })
    expect(fillAddress({ kind: 'record', resource: 'lines', key: ['{orderId}', 3] }, { orderId: 42 })).toEqual({ kind: 'record', resource: 'lines', key: ['42', 3] })
    expect(fillAddress({ kind: 'list', resource: 'repairs', filter: 'customerId = {customerId} AND bike = "{bike}"', display: 'cards' }, { customerId: 7, bike: 'Gazelle' })).toEqual({
      kind: 'list',
      resource: 'repairs',
      filter: 'customerId = 7 AND bike = "Gazelle"',
      display: 'cards',
    })
  })

  it("fills a create form's values from the record", () => {
    expect(fillAddress({ kind: 'create', resource: 'notes', values: { listing_id: '{id}', body: 'About {title}' } }, { id: 42, title: 'Keizersgracht 12' })).toEqual({
      kind: 'create',
      resource: 'notes',
      values: { listing_id: '42', body: 'About Keizersgracht 12' },
    })
    expect(addressPlaceholders({ kind: 'create', resource: 'notes', values: { listing_id: '{id}' } })).toEqual(['id'])
  })

  it('leaves a missing value empty and other addresses alone', () => {
    expect(fillAddress({ kind: 'record', resource: 'orders', key: '{orderId}' }, { orderId: null })).toEqual({ kind: 'record', resource: 'orders', key: '' })
    expect(fillAddress({ kind: 'page', page: 'overview' }, {})).toEqual({ kind: 'page', page: 'overview' })
  })
})

describe('addressPlaceholders', () => {
  it('names each field a link takes from the record once', () => {
    expect(addressPlaceholders({ kind: 'list', resource: 'repairs', filter: 'customerId = {customerId} OR referredBy = {customerId}', orderBy: '{sort}' })).toEqual(['customerId', 'sort'])
    expect(addressPlaceholders({ kind: 'record', resource: 'lines', key: ['{orderId}', 3] })).toEqual(['orderId'])
    expect(hrefPlaceholders('https://maps.example/?q={street}+{city}')).toEqual(['street', 'city'])
  })
})

describe('leavesApp', () => {
  it('lets links with a scheme or a host through, and refuses paths in the app', () => {
    expect(['https://pay.example/{plan}', 'mailto:a@b.c', 'tel:+31', '//cdn.example/x'].every(leavesApp)).toBe(true)
    expect(['/orders/1', 'orders/1', '?filter=x', '#top', '{website}', ''].some(leavesApp)).toBe(false)
    expect(appHrefError('/repairs?filter=x')).toContain('give the link `to` instead')
    expect(appHrefError('https://pay.example')).toBeUndefined()
  })
})

describe('linkActionError', () => {
  it("takes an href that is only a field, the URL the record holds, and nothing else of the app's own", () => {
    expect(hrefField('{website}')).toBe('website')
    expect(['https://{website}', '{website}/x', '{ website }', '{a}{b}', ''].map(hrefField)).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(linkActionError('View on {host}', { href: '{website}' })).toBeUndefined()
    expect(linkActionError('Open', { href: '{website}/x' })).toContain('points inside the app')
  })

  it('refuses {host} in the label of a link to an address in the app', () => {
    expect(linkActionError('Open on {host}', { href: 'https://pay.example/{plan}' })).toBeUndefined()
    expect(linkActionError('Go to {host}', { to: { kind: 'page', page: 'overview' } })).toBe('the label names {host}, which only a link with an href has')
    expect(linkActionError('Overview', { to: { kind: 'page', page: 'overview' } })).toBeUndefined()
  })
})
