import { enqueueJob, subscription } from '@protobase/server'

// Email me on a new submission: the record's event enqueues a job (jobs/email-contact-request.ts), and the job sends
// the mail.
export const newContactRequests = subscription('newContactRequests', {
  events: ['contact_requests.created'],
  run: async (event, { db }) => {
    await enqueueJob(db, 'email-contact-request', { id: Number(event.data.key) }, { key: `contact-request:${event.data.key}` })
  },
})
