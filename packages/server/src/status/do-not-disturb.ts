import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { qualified } from '../notifications/schema-sql'
import type { StatusNames } from './options'

/**
 * Which of these people are on do not disturb now: their status says so and its clear time, if any, is still to come.
 * The one check of everything that would alert someone, such as a push, so each holds it alike.
 */
export const onDoNotDisturb = async (db: Db, names: StatusNames, userIds: readonly string[]): Promise<Set<string>> => {
  if (userIds.length === 0) return new Set()
  const { rows } = await sql<{ user_id: string }>`select user_id from ${sql.raw(qualified(names))}
    where user_id in (${sql.join([...new Set(userIds)])}) and availability = 'do_not_disturb' and (clears_at is null or clears_at > now())`.execute(db)
  return new Set(rows.map((row) => String(row.user_id)))
}
