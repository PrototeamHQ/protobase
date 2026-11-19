import type { DerivedCompute } from '@protobase/server'

// "late" once an open task is older than two hours, "open" while any is open, else "done": the oldest open task decides.
export default (async (key, { db, clock }) => {
  const oldest = await db.selectFrom('tasks').select(['created_at']).where('objective_id', '=', Number(key)).where('status', '=', 'open').orderBy('created_at').limit(1).executeTakeFirst()
  if (!oldest) return 'done'
  return clock.olderThan(oldest.created_at, '2 hours') ? 'late' : 'open'
}) satisfies DerivedCompute
