import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'
import { view } from './view'

const messages = resource('direct_messages').table('direct_messages').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id)

describe('nav.create', () => {
  it('keeps a create link beside recent records, as true or with its own label', () => {
    expect(view<typeof messages>('direct_messages').nav({ recent: { limit: 5 }, create: true }).toModel(messages.toModel()).nav).toEqual({ recent: { limit: 5 }, create: true })
    expect(view<typeof messages>('direct_messages').nav({ create: { label: 'New message' } }).toModel().nav).toEqual({ create: { label: 'New message' } })
  })

  it('refuses an empty label, on the view and on a named list', () => {
    expect(() => view<typeof messages>('direct_messages').nav({ create: { label: ' ' } }).toModel()).toThrow('View "direct_messages": nav.create needs a label')
    const named = view<typeof messages>('direct_messages').namedList('unread', (v) => v.names({ singular: 'Message', plural: 'Unread' }).nav({ create: { label: '' } }))
    expect(() => named.toModel()).toThrow('nav.create needs a label')
  })
})
