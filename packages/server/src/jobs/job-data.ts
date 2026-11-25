import type { Db, Organization, ScopedDb } from '@protobase/query'

/**
 * The key of the stored data that holds the organization a job was enqueued in, beside its payload under `payload`:
 * `{ "~organization": "org_1", "payload": { ... } }`. The failed jobs view (`functionsSql`) shows `payload` alone.
 */
export const organizationKey = '~organization'

type Stored = { [organizationKey]: Organization | null; payload: unknown }

const isStored = (data: unknown): data is Stored => typeof data === 'object' && data !== null && !Array.isArray(data) && Object.hasOwn(data, organizationKey)

/** The organization `db` works in: a `ScopedDb`'s own one, or none for every organization, `unscoped()` or a plain database. */
export const organizationOf = (db: Db): Organization => {
  const organization: unknown = (db as { organization?: ScopedDb['organization'] }).organization
  return typeof organization === 'string' || typeof organization === 'number' ? organization : undefined
}

/**
 * What pg-boss stores for a job: the payload alone when it works in no organization, or the organization beside it. A
 * payload of its own that holds `organizationKey` goes beside one too, so it stays payload and never names the organization.
 */
export const jobData = (payload: unknown, organization: Organization): unknown => {
  if (organization === undefined && !isStored(payload)) return payload ?? null
  return { [organizationKey]: organization ?? null, payload: payload ?? null }
}

/** The payload and the organization of a job's stored data; data without `organizationKey`, such as `jobs.enqueue`'s from SQL, works in none. */
export const readJobData = (data: unknown): { payload: unknown; organization: Organization } => {
  if (!isStored(data)) return { payload: data, organization: undefined }
  return { payload: data.payload, organization: data[organizationKey] ?? undefined }
}
