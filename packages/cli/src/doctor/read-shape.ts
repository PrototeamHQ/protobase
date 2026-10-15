import type { CoverageQuery, Scope } from '@protobase/query'

/**
 * A read of a resource that the app makes or the API takes: the request, where in the config it comes from, and what
 * the index rule judges of it, the filter, sort or counted field and any row filter of the caller's role.
 */
export type ReadShape = { resource: string; request: string; from: string; query: CoverageQuery; scope?: Scope }
