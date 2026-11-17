import { PostgresDialect } from 'kysely'
import type { PostgresDatabase } from './postgres-database'

/** A statement as it was sent: its text and parameters. */
export type SentStatement = { text: string; values: unknown[] }

/**
 * A dialect over a pool of `store` that keeps every statement sent through it, for an app to run on, and `plansOf`:
 * the plan Postgres makes, on the rows the store holds then, for each kept statement that reads `table`, by `explain`
 * with the same parameters. Proves the indexes the statements an app really sends use, not those of a copy of them.
 */
export const watchStatements = (store: PostgresDatabase) => {
  const sent: SentStatement[] = []
  const pool = store.pool({ max: 5 })
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (text: unknown, values?: unknown) => unknown
    client.query = ((text: unknown, values?: unknown) => {
      if (typeof text === 'string') sent.push({ text, values: Array.isArray(values) ? values : [] })
      return query(text, values)
    }) as typeof client.query
  })
  const explainer = store.pool({ max: 1 })
  const reads = (statement: SentStatement, table: string) => new RegExp(`(from|join|update|into)\\s+("[^"]+"\\.)?"?${table}"?[\\s(]`, 'i').test(statement.text)
  const plansOf = async (table: string) => {
    const plans: string[] = []
    for (const statement of sent.filter((kept) => reads(kept, table) && !/^\s*(create|alter|drop|begin|commit|rollback)\b/i.test(kept.text))) {
      const { rows } = await explainer.query<{ 'QUERY PLAN': string }>(`explain ${statement.text}`, statement.values)
      plans.push(rows.map((row) => row['QUERY PLAN']).join('\n'))
    }
    return plans
  }
  return { dialect: new PostgresDialect({ pool }), sent, plansOf, forget: () => void sent.splice(0) }
}

/** The sequential scans of `table` among `plans`. */
export const seqScansOf = (plans: string[], table: string) => plans.filter((plan) => new RegExp(`Seq Scan on ("?[\\w]+"?\\.)?"?${table}"?\\b`).test(plan))
