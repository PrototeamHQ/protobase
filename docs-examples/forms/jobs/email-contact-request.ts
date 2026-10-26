import { FatalJobError, type JobRun } from '@protobase/server'

// Emails the shop a new contact request, enqueued by the newContactRequests subscription (notify.ts).
export default (async ({ id }, { db, mail }) => {
  if (!mail) throw new FatalJobError('Mail is off: set PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM')
  const request = await db.selectFrom('contact_requests').select(['name', 'email', 'message']).where('id', '=', id).executeTakeFirst()
  if (!request) return
  await mail.send({ to: 'shop@example.com', subject: `Contact request from ${request.name}`, text: `${request.email} wrote:\n\n${request.message}` })
}) satisfies JobRun<{ id: number }>
