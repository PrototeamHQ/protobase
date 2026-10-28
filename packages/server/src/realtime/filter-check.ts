import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { Caller } from '../api-keys/resolve-caller'
import { tableSql } from '../changes/capture-sql'
import { isDatabaseError } from '../error-handler'
import type { Entry } from '../registry'
import { callerSettings } from '../rest/caller-settings'
import { readTransaction } from '../transactions'
import { boundedRunner } from './bounded-runner'
import { filterSql } from './change-filter'
import { fitsOneQuery } from './filter-chunks'
import type { ChangeBinding } from './postgres-changes'
import { isStatementError } from './savepoint-attempt'

export type FilterCheckOptions = { db: Db; statementTimeoutMs: number }

/** Why a join or token refresh is refused when Postgres refuses one of its filters: it names the channel's own only. */
export const refusedFiltersText = (filters: readonly string[]) =>
  `Unable to subscribe to changes with given parameters: the database refused the filters [${filters.join(', ')}]`

export const busyText = 'Too many joins are being checked; try again'

const regexOperators = { match: '~', imatch: '~*' } as const

// Each regex column's collation, as its quoted name, so a pattern compiles as the column would compile it.
const collations = async (trx: Db, entry: Entry, columns: readonly string[]) => {
  const { rows } = await sql<{ name: string; collation: string }>`select a.attname as name, quote_ident(n.nspname) || '.' || quote_ident(c.collname) as collation
    from pg_attribute a join pg_collation c on c.oid = a.attcollation join pg_namespace n on n.oid = c.collnamespace
    where a.attrelid = to_regclass(${tableSql(entry.model)}) and a.attname = any(${[...columns]}) and not a.attisdropped`.execute(trx)
  return new Map(rows.map((row) => [row.name, row.collation]))
}

// Plans and starts each binding's filter on the table under the caller's role, reading no row: the columns must exist
// and the role may select them, each operator must exist for its column's type, and each value is read by the
// column type's input function. Then each pattern compiles under its column's collation.
const validate = async (trx: Db, entry: Entry, bindings: readonly ChangeBinding[]) => {
  await sql`select ${sql.join(bindings.map((binding) => filterSql('t', binding.conditions)))} from ${sql.raw(tableSql(entry.model))} t where false`.execute(trx)
  const patterns = bindings.flatMap((binding) => binding.conditions).filter((condition) => condition.operator === 'match' || condition.operator === 'imatch')
  if (patterns.length === 0) return
  const collated = await collations(trx, entry, [...new Set(patterns.map((condition) => condition.column))])
  const probes = patterns.map(({ column, operator, value }) => {
    const collation = collated.get(column)
    const subject = collation === undefined ? sql`''::text` : sql`''::text collate ${sql.raw(collation)}`
    return sql`${subject} ${sql.raw(regexOperators[operator as keyof typeof regexOperators])} ${value}`
  })
  await sql`select ${sql.join(probes)}`.execute(trx)
}

/**
 * Whether Postgres takes the filters of a channel's bindings under `caller`, as Supabase checks them at join: the
 * refusal text when it does not, so that a filter that would fail a check never joins the callers it would be checked
 * with. One check runs at a time per process, and a few more wait, so joins never take the pooled connections that
 * deliver changes; a join beyond those is refused.
 */
export const filterCheck = ({ db, statementTimeoutMs }: FilterCheckOptions) => {
  const runner = boundedRunner(1, 32)

  return async (caller: Caller, bindings: readonly ChangeBinding[]): Promise<string | undefined> => {
    const filtered = bindings.filter((binding) => binding.conditions.length > 0)
    if (filtered.length === 0) return
    const filters = [...new Set(filtered.map((binding) => binding.filter!))]
    if (!filtered.every((binding) => fitsOneQuery(binding.conditions))) return refusedFiltersText(filters)
    const settings = { role: 'none', 'request.jwt.claim.sub': '', ...callerSettings(caller) }
    const entries = [...new Set(filtered.flatMap((binding) => binding.entries))]
    const checked = await runner
      .run(() =>
        readTransaction(
          db,
          statementTimeoutMs,
          async (trx) => {
            for (const entry of entries) await validate(trx, entry, filtered.filter((binding) => binding.entries.includes(entry)))
            return true
          },
          settings,
        ),
      )
      .catch((error: unknown) => {
        // A filter Postgres refuses, or one it could not check within the statement timeout.
        if (isStatementError(error) || (isDatabaseError(error) && error.code === '57014')) return { refused: false as const, value: false }
        throw error
      })
    if (checked.refused) return busyText
    return checked.value ? undefined : refusedFiltersText(filters)
  }
}

export type FilterCheck = ReturnType<typeof filterCheck>
