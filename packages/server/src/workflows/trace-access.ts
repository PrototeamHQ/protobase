import type { RequestAccess } from '../request-access'

/**
 * Whether the caller may read runs' traces: read the runs and their `trace_file`, which a field rule may hide while the
 * runs stay readable. The run's page and a replay, which gives its steps what the trace says, both check it.
 */
export const readsTrace = (access: RequestAccess) => access.resolved.operations.read && access.resolved.readableFields.includes('trace_file')
