import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { blockedDelete, blockedDeleteText } from './blocked-delete'

const resources = { orders: { name: 'orders' } as ResourceModel, line_items: { name: 'line_items' } as ResourceModel }
const views = { orders: { resource: 'orders', names: { singular: 'Order', plural: 'Orders' } } as ViewModel }

describe('blockedDeleteText', () => {
  it('names what still points at the record', () => {
    expect(blockedDeleteText({ blockingPlural: 'Orders', noun: 'Company' })).toBe('Orders still point at this company.')
  })
})

describe('blockedDelete', () => {
  it('links to the list filtered to the records pointing at it', () => {
    expect(blockedDelete({ blockedBy: { resource: 'orders', field: 'company_id' }, resources, views, noun: 'Company', key: '7' })).toEqual({
      text: 'Orders still point at this company.',
      link: { label: 'Show orders', to: { kind: 'list', resource: 'orders', filter: 'company_id = "7"' } },
    })
  })

  it('names them without a link when the server names no field, or the key is not one value', () => {
    expect(blockedDelete({ blockedBy: { resource: 'orders' }, resources, views, noun: 'Company', key: '7' })).toEqual({ text: 'Orders still point at this company.' })
    expect(blockedDelete({ blockedBy: { resource: 'orders', field: 'company_id' }, resources, views, noun: 'Company' })).toEqual({ text: 'Orders still point at this company.' })
  })

  it('names a resource without a view in words', () => {
    expect(blockedDelete({ blockedBy: { resource: 'line_items' }, resources, views, noun: 'Order' })?.text).toBe('Line items still point at this order.')
  })

  it('says nothing of a resource the app does not show', () => {
    expect(blockedDelete({ blockedBy: { resource: 'invoices' }, resources, views, noun: 'Company' })).toBeUndefined()
  })
})
