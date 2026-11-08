import type { WorkflowsStorage } from '../options'
import { isStoredPath } from './stored-path'

/** A configuration's row, as the write hook and the resolver read it; a set key may be an opaque stored value. */
export type ConfigurationRow = { kind?: unknown; dir?: unknown; bucket?: unknown; region?: unknown; endpoint?: unknown; access_key_id?: unknown; secret_access_key?: unknown }

// The S3 API's bucket names and region names, so neither can steer the default host elsewhere.
const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const regionPattern = /^[a-z0-9-]{1,32}$/

// Compared strictly: a set encrypted value throws when compared loosely.
const empty = (value: unknown) => value === null || value === undefined

/**
 * What is wrong with a configuration under the app's storage options, as `{ field, message }`, or `undefined`: a local
 * one needs the storage root and a folder inside it and nothing of a bucket; an S3 one a bucket, a region of the S3
 * API's form, an endpoint from the app's list, and either both keys or neither. Region and endpoint are required so the
 * S3 client never takes them from the server's environment. The endpoint's addresses are
 * checked apart, since that needs the network.
 */
export const configurationProblem = (row: ConfigurationRow, storage: WorkflowsStorage): { field: string; message: string } | undefined => {
  if (row.kind === 'local') {
    if (storage.root === undefined) return { field: 'kind', message: 'This app sets no storage root (workflows.storage.root), so it takes only s3 configurations' }
    if (!isStoredPath(row.dir)) return { field: 'dir', message: 'dir is a folder inside the storage root: letters, digits, ".", "_" and "-" in segments split by "/", none starting with "."' }
    for (const field of ['bucket', 'region', 'endpoint', 'access_key_id', 'secret_access_key'] as const) if (!empty(row[field])) return { field, message: `A local configuration takes no ${field}` }
    return
  }
  if (row.kind !== 's3') return { field: 'kind', message: 'kind is local or s3' }
  if (!empty(row.dir)) return { field: 'dir', message: 'An s3 configuration takes no dir' }
  if (typeof row.bucket !== 'string' || !bucketPattern.test(row.bucket)) return { field: 'bucket', message: 'bucket is a bucket name: 3 to 63 lowercase letters, digits, "." and "-"' }
  if (typeof row.region !== 'string' || !regionPattern.test(row.region)) return { field: 'region', message: 'region is a region name such as eu-west-1' }
  const origin = typeof row.endpoint === 'string' && URL.canParse(row.endpoint) ? new URL(row.endpoint).origin : undefined
  if (origin === undefined || !storage.endpoints.includes(origin) || row.endpoint !== origin) {
    return { field: 'endpoint', message: storage.endpoints.length === 0 ? 'This app allows no endpoint (workflows.storage.endpoints), so it takes no s3 configuration' : `endpoint is one of ${storage.endpoints.join(', ')}` }
  }
  if (empty(row.access_key_id) !== empty(row.secret_access_key)) return { field: 'secret_access_key', message: 'Give both access_key_id and secret_access_key, or neither' }
  return
}
