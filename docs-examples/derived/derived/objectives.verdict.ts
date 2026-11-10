import type { DerivedCompute } from '@protobase/server'

// "late" once an open task is older than two hours, "open" while any is open, else "done".
export default (async (key, { db, clock }) => {
  const open = await db.selectFrom('tasks').select(['created_at']).where('objective_id', '=', Number(key)).where('status', '=', 'open').execute()
  if (open.length === 0) return 'done'
  return open.some((task) => clock.olderThan(task.created_at, '2 hours')) ? 'late' : 'open'
}) satisfies DerivedCompute
