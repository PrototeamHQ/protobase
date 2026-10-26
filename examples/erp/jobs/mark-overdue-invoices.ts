import { sql } from 'kysely'
import type { JobRun } from '@protobase/server'

// Declared in protobase.config.ts: every night, the sent invoices that passed their due date, such as imported ones
// that never had a check enqueued.
export default (async (_, { db }) => {
  await sql`update sales.invoices set status = 'overdue' where status = 'sent' and due_at < current_date`.execute(db)
}) satisfies JobRun
