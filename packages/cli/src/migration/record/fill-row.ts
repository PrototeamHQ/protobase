import type { ISql } from 'postgres'
import { recordTable } from '@protobase/server/internal'
import { parseHeader } from '../snapshot/header'
import { builtIndex, afterStatements } from './after-file'
import type { DirMigration } from './migration-dir'
import { sqlHash } from './record-block'

/**
 * Fills what the row a migration just inserted left unknown from its finished text, in the transaction that applied
 * it: the hash and whether it is additive (its header's `-- protobase:additive`), as for a file filled by hand. With an
 * `.after.sql`, the indexes that builds, and the row is not complete until it has run.
 */
export const fillRow = async (tx: ISql, { id, text, after }: DirMigration) => {
  if (!id) return
  const indexes = after && afterStatements(after.text).map(builtIndex).filter((index) => index !== undefined)
  await tx.unsafe(
    `update ${recordTable} set sql_hash = coalesce(sql_hash, $2), additive = coalesce(additive, $3),
      physical = case when $4::text::jsonb is null then physical else jsonb_set(physical, '{after}', $4::text::jsonb) end,
      completed_at = case when $4::text::jsonb is null then completed_at end
    where id = $1`,
    [id, sqlHash(text), parseHeader(text)?.additive ?? false, indexes ? JSON.stringify(indexes) : null],
  )
}
