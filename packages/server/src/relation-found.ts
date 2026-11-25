import { sql } from 'kysely'
import type { Db } from '@protobase/query'

/** Whether the database has a relation of the name, as SQL writes it, such as `"webhooks"."subscriptions"`. Only reads the catalogue. */
export const relationFound = async (db: Db, name: string) => (await sql<{ found: boolean }>`select to_regclass(${name}) is not null as found`.execute(db)).rows[0]!.found
