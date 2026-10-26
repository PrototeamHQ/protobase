import type { JobRun } from '@protobase/server'

export default (async (_, { db }) => {
  // ... mail a reminder for every invoice past its due date
}) satisfies JobRun
