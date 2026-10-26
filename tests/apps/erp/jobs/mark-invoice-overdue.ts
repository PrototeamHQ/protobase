import { sql } from 'kysely'
import type { JobRun } from '@protobase/server'

// Declared in protobase.config.ts: an invoice still sent and unpaid once its due date has passed becomes overdue.
export default (async ({ invoiceId }, { db }) => {
  await sql`update sales.invoices set status = 'overdue' where id = ${invoiceId} and status = 'sent' and due_at < current_date`.execute(db)
}) satisfies JobRun<{ invoiceId: string }>
