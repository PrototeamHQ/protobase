import { defineJob, FatalJobError, subscription } from '@protobase/server'
import { z } from 'zod'

// Email me on a new submission: the record's event enqueues a job, and the job sends the mail.

export const emailContactRequest = defineJob({
  name: 'email-contact-request',
  payload: z.object({ id: z.number() }),
  run: async ({ id }, { db, mail }) => {
    if (!mail) throw new FatalJobError('Mail is off: set PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM')
    const request = await db.selectFrom('contact_requests').select(['name', 'email', 'message']).where('id', '=', id).executeTakeFirst()
    if (!request) return
    await mail.send({ to: 'shop@example.com', subject: `Contact request from ${request.name}`, text: `${request.email} wrote:\n\n${request.message}` })
  },
})

export const newContactRequests = subscription('newContactRequests', {
  events: ['contact_requests.created'],
  run: async (event, { db }) => {
    await emailContactRequest.enqueue(db, { id: Number(event.data.key) }, { key: `contact-request:${event.data.key}` })
  },
})
