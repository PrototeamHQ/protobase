import { f, resource, view } from '@protobase/schema'

// A shop's contact form: anyone, signed in or not, sends a request at /-/forms/contact; staff answer them in the app.

/** contact_requests */
export const contactRequests = resource('contact_requests')
  .table('contact_requests')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    name: f.text().max(100),
    email: f.text().max(200),
    topic: f.enum(['order', 'repair', 'other']).default('other'),
    message: f.text().max(4000),
    handled: f.boolean().default(false).filterable(),
    created_at: f.timestamp().readOnly().sortable(),
  })
  .primaryKey((r) => r.id)
  .validate((request) => (request.email.includes('@') ? undefined : [{ field: 'email', message: 'Enter an email address' }]))
  // contact_requests.created: a job emails the shop about each one (see notify.ts)
  .events((e) => [e.created()])

export const contactRequestsView = view<typeof contactRequests>('contact_requests')
  .names({ singular: 'Contact request', plural: 'Contact requests' })
  .fields((r) => ({ name: r.name.label('Your name'), topic: r.topic.valueLabels({ order: 'An order', repair: 'A repair', other: 'Something else' }), message: r.message.multiline() }))
  .list((r) => ({ columns: [r.created_at, r.name, r.topic, r.handled], sort: [[r.created_at, 'desc']] }))
  .form((r) => ({
    name: 'contact',
    title: 'Contact us',
    fields: [r.name, r.email, r.topic, r.message],
    thanks: 'Thanks, we will reply within a day.',
  }))
