import { describe, expect, it } from 'vitest'
import { f } from './fields'
import { resource } from './resource'
import { view } from './view'
import type { FormInput } from './view-form'

const requests = resource('contact_requests')
  .table('contact_requests')
  .fields({ id: f.integer().readOnly(), name: f.text(), email: f.text(), message: f.text(), handled: f.boolean() })
  .primaryKey((r) => r.id)

const contact = view<typeof requests>('contact_requests')

describe('public forms', () => {
  it('keeps the fields in order, five submissions a minute unless told otherwise', () => {
    const model = contact.form((r) => ({ name: 'contact', fields: [r.name, r.email, r.message], thanks: 'Thanks!' })).toModel(requests.toModel())
    expect(model.forms).toEqual([{ name: 'contact', fields: ['name', 'email', 'message'], thanks: 'Thanks!', perMinute: 5 }])
  })

  it('adds a form per call, with its own title and limit', () => {
    const model = contact
      .form((r) => ({ name: 'contact', fields: [r.name, r.email], thanks: 'Thanks!' }))
      .form((r) => ({ name: 'call-back', title: 'Call me back', fields: [r.name], thanks: 'We will call.', perMinute: 2 }))
      .toModel()
    expect(model.forms?.map((form) => [form.name, form.title, form.perMinute])).toEqual([['contact', undefined, 5], ['call-back', 'Call me back', 2]])
  })

  it('refuses a name that does not fit an address, no or repeated fields, and an empty thanks, title or limit', () => {
    const form = (input: Partial<FormInput>) => () => contact.form((r) => ({ name: 'contact', fields: [r.name], thanks: 'Thanks!', ...input }))
    expect(form({ name: 'Contact us' })).toThrow('lowercase letters, digits, - and _, not "Contact us"')
    expect(form({ name: '-contact' })).toThrow('not "-contact"')
    expect(form({ fields: [] })).toThrow('Form "contact" has no fields')
    expect(() => contact.form((r) => ({ name: 'contact', fields: [r.name, r.name], thanks: 'Thanks!' }))).toThrow('lists the field "name" twice')
    expect(form({ thanks: ' ' })).toThrow('needs a thanks text')
    expect(form({ title: '' })).toThrow('has an empty title')
    expect(form({ perMinute: 0 })).toThrow('perMinute as a positive whole number, not 0')
    expect(form({ perMinute: 1.5 })).toThrow('not 1.5')
  })

  it('refuses a field the resource does not have once it knows the resource', () => {
    const stray = contact.form(() => ({ name: 'contact', fields: [{ name: 'phone' } as never], thanks: 'Thanks!' }))
    expect(() => stray.toModel(requests.toModel())).toThrow('View "contact_requests": form "contact" names field "phone", which the resource does not have')
  })
})
