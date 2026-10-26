import type { JobRun } from '@protobase/server'

export default (async ({ customerId, fields }) => {
  // ... push the changed fields to the CRM
}) satisfies JobRun<{ customerId: number; fields: string[] }>
