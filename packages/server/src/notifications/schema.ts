import { sql } from 'kysely'
import type { Db } from '@protobase/query'

export const regclass = async (db: Db, name: string) => (await sql<{ oid: number | null }>`select to_regclass(${name})::oid as oid`.execute(db)).rows[0]!.oid
