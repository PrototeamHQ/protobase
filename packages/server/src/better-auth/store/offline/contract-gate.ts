import { sql, type RawBuilder } from 'kysely'
import { recordTable } from '../../../migration-record/record-table'
import { ddl, ddlText } from '../ddl'

// What `protobase migration contract` and `protobase migration delete` write: statements that take from older code
// what an earlier migration stopped it from using, each under the mark that names that migration, behind a check that
// the update it belongs to was signed off.

/** The line that marks the statement under it as taking what the migration `id` stopped older code from using. */
export const contractMark = (id: string) => `-- protobase:contract ${id}`

/** `statements` as SQL text, each under the mark naming the migration `id`. */
export const markedSql = (id: string, statements: readonly RawBuilder<unknown>[]) => statements.map((statement) => `${contractMark(id)}\n${ddlText(statement)};`).join('\n\n')

/** A migration a sign-off waits on: its id and file name, as `migrations.history` records them. */
export type SignedOff = { id: string; name: string }

/**
 * The block that refuses, unless `migrations.history` has `after`'s row, `hours` have passed since it was applied,
 * and, when `followed`, a row applied after it: what `step` says it does waits for the update to have served that long,
 * and for the next one to have followed it.
 */
export const signOffGate = (after: SignedOff, hours: number, step: string, followed: boolean) => {
  const waits = `${step} waits until ${after.name}`
  const next = ddl`
  if not exists (select from ${sql.raw(recordTable)} where applied_at > applied) then
    raise exception '%', ${sql.lit(`${waits} is followed by a migration applied after it, as the next update applies one`)};
  end if;`
  return ddl`do $gate$
declare
  applied timestamptz;
begin
  select applied_at into applied from ${sql.raw(recordTable)} where id = ${sql.lit(after.id)};
  if applied is null then
    raise exception '%', ${sql.lit(`${waits} is applied`)};
  end if;${followed ? next : sql``}
  if now() - applied < ${sql.lit(`${hours} hours`)}::interval then
    raise exception '%', format(${sql.lit(`${waits} was applied ${hours} hours ago; it was applied at %s`)}, applied);
  end if;
end
$gate$`
}
