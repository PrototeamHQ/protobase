import { sql, type Kysely } from 'kysely'
import type { ResourceModel } from '@protobase/schema'
import { bucketsRefreshes } from '@protobase/server/internal'

// An ISO 8601 date, or a date and time with an optional zone; a time without a zone is UTC, as the buckets are.
const timePattern = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/

// A calendar date that exists: `Date` rolls 2026-02-30 over to March, so it is read back.
const isDate = (date: string) => new Date(`${date}T00:00Z`).toISOString().slice(0, 10) === date

const notATime = (value: string) => new Error(`--from "${value}" is not a time: pass a date or a date and time, such as 2026-07-01 or 2026-07-01T10:00Z`)

/** The time `--from` names, as an ISO string in UTC; a value that is not a date or a date and time stops with an error naming it. */
export const parseFrom = (value: string) => {
  const match = timePattern.exec(value)
  if (!match) throw notATime(value)
  const [, date, clock = '00:00', zone = 'Z'] = match
  const time = new Date(`${date}T${clock}${zone}`)
  if (Number.isNaN(time.getTime()) || !isDate(date!)) throw notATime(value)
  return time.toISOString()
}

/** The refresh function of the time rollup `resource`; any other resource stops with an error naming it. */
export const rebuildFunction = (models: readonly ResourceModel[], resource: string) => {
  const model = models.find((candidate) => candidate.name === resource)
  if (!model) throw new Error(`The project has no resource "${resource}"`)
  const [refresh] = bucketsRefreshes([model])
  if (!refresh) throw new Error(`"${resource}" is not a time rollup: only a resource declared with .bucketsOf() can be rebuilt`)
  return refresh.fn
}

/**
 * Recounts the time rollup `resource` from the bucket `from` falls in, or every bucket without it, through its refresh
 * function: one statement that writes only the rollup's table.
 */
export const rebuildBuckets = async (db: Kysely<any>, models: readonly ResourceModel[], resource: string, from: string | undefined) => {
  const fn = rebuildFunction(models, resource)
  await sql`select ${sql.raw(fn)}(${from ?? '-infinity'}::timestamptz)`.execute(db)
}
