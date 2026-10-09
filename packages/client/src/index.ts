export { createClient, type Client } from './client'
export { ApiError, PreconditionFailedError, isApiError, type ProblemDetails, type ProblemError } from './problem'
export { listWire, filterText, type FilterInput, type ListParams } from './query-string'
export type { ClientOptions } from './transport'
export type {
  ResourceRef,
  RecordOf,
  ListPage,
  Facet,
  Series,
  SeriesPoint,
  SeriesParams,
  Histogram,
  HistogramBucket,
  Meta,
  ResourcePermissions,
  MetaResult,
  Stored,
  RecordPermissions,
  BatchOp,
  BatchRef,
  BatchResult,
} from './types'
export { createAuthSession, createStaticSession, AuthError, tokenExpiry, type AuthSession, type AuthSessionOptions, type AuthUser, type SetupStatus } from './auth'
