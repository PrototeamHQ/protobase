import { describe, expect, it } from 'vitest'
import { defineRoles, f, resource, view, type ViewModel } from '@protobase/schema'
import { buildRegistry } from '../registry'
import { createFormsRuntime } from './runtime'

const requests = resource('contact_requests')
  .table('contact_requests')
  .fields({
    id: f.integer().readOnly(),
    name: f.text(),
    email: f.text(),
    message: f.text().optional(),
    topic: f.enum(['sales', 'support']).default('sales'),
    customer_id: f.relation('customers').optional(),
    attachment: f.file().optional(),
    secret_note: f.text().optional().sensitive(),
    extra: f.json().optional(),
    handled: f.boolean().optional(),
  })
  .primaryKey((r) => r.id)
const customers = resource('customers').table('customers').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id)
const registry = buildRegistry([requests, customers])
const allowed = ['name', 'email', 'message', 'topic', 'customer_id', 'attachment', 'secret_note', 'extra', 'id']
const roles = defineRoles({ anonymous: [{ 'contact_requests.create': allowed }] })
const env = { BETTER_AUTH_SECRET: 'secret' }

const contact = view<typeof requests>('contact_requests')
const runtime = (views: ViewModel[], options: { limits?: typeof roles.limits; env?: Record<string, string> } = {}) => () =>
  createFormsRuntime({ registry, views, limits: options.limits ?? roles.limits, env: options.env ?? env })

describe('createFormsRuntime', () => {
  it('serves nothing and needs no secret without forms', () => {
    expect(runtime([contact.toModel()], { env: {} })()).toBeUndefined()
  })

  it('takes the forms by name, with the view that declares them', () => {
    const forms = runtime([contact.form((r) => ({ name: 'contact', fields: [r.name, r.email, r.message], thanks: 'Thanks!' })).toModel()])()!.forms
    expect([...forms.keys()]).toEqual(['contact'])
    expect(forms.get('contact')!.view.resource).toBe('contact_requests')
  })

  it('needs a secret to sign the bot checks', () => {
    const views = [contact.form((r) => ({ name: 'contact', fields: [r.name, r.email], thanks: 'Thanks!' })).toModel()]
    expect(runtime(views, { env: {} })).toThrow('set PROTOBASE_FORMS_SECRET or BETTER_AUTH_SECRET')
    expect(runtime(views, { env: { PROTOBASE_FORMS_SECRET: 'secret' } })).not.toThrow()
  })

  it('refuses fields a visitor cannot fill in', () => {
    const fieldsOf = (pick: Parameters<typeof contact.form>[0]) => runtime([contact.form(pick).toModel()])
    const form = (fields: string[]) => fieldsOf(() => ({ name: 'contact', fields: fields.map((name) => ({ name })) as never, thanks: 'Thanks!' }))
    expect(form(['name', 'email', 'id'])).toThrow('View "contact_requests": form "contact": field "id" is read-only')
    expect(form(['name', 'email', 'secret_note'])).toThrow('field "secret_note" is sensitive')
    expect(form(['name', 'email', 'customer_id'])).toThrow('field "customer_id" is a relation')
    expect(form(['name', 'email', 'attachment'])).toThrow('field "attachment" is a file field')
    expect(form(['name', 'email', 'extra'])).toThrow('field "extra" is json, which a form has no input for')
    expect(form(['name', 'email', 'phone'])).toThrow('field "phone" does not exist on contact_requests')
  })

  it('needs the anonymous role to create every field, and the form to give every field a create needs', () => {
    const form = contact.form((r) => ({ name: 'contact', fields: [r.name, r.email, r.handled], thanks: 'Thanks!' })).toModel()
    expect(runtime([form])).toThrow(`the anonymous role does not create "handled": add it to { 'contact_requests.create': [...] }`)
    expect(runtime([form], { limits: [] })).toThrow(`the anonymous role must grant creating its fields: { 'contact_requests.create': ['name', 'email', 'handled'] }`)
    const short = contact.form((r) => ({ name: 'contact', fields: [r.name, r.message], thanks: 'Thanks!' })).toModel()
    expect(runtime([short])).toThrow('it leaves out "email", which every create must give')
  })

  it('refuses a name two forms share, but counts a form a view built on another repeats as one', () => {
    const base = contact.form((r) => ({ name: 'contact', fields: [r.name, r.email], thanks: 'Thanks!' }))
    expect(runtime([base.forRoles(['admin']).toModel(), base.toModel()])()!.forms.get('contact')!.view.roles).toBeUndefined()
    const other = contact.form((r) => ({ name: 'contact', fields: [r.name, r.email, r.message], thanks: 'Thanks!' }))
    expect(runtime([base.toModel(), other.forRoles(['admin']).toModel()])).toThrow('the name is taken by a form of contact_requests')
  })
})
