import { PostgresDialect } from 'kysely'
import type { PostgresDatabase } from './postgres-database'

/**
 * A statement as it was sent: its text and parameters, and the `set_config` statements its transaction ran before it,
 * such as the caller's role and claims a row-level policy reads.
 */
export type SentStatement = { text: string; values: unknown[]; settings: { text: string; values: unknown[] }[] }

/**
 * A dialect over a pool of `store` that keeps every statement sent through it, for an app to run on, and `plansOf`:
 * the plan Postgres makes, on the rows the store holds then, for each kept statement that reads `table`, by `explain`
 * with the same parameters and settings. Proves the indexes the statements an app really sends use, not those of a copy
 * of them.
 */
export const watchStatements = (store: PostgresDatabase) => {
  const sent: SentStatement[] = []
  const pool = store.pool({ max: 5 })
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (text: unknown, values?: unknown) => unknown
    let settings: SentStatement['settings'] = []
    client.query = ((text: unknown, values?: unknown) => {
      if (typeof text === 'string') {
        const kept = { text, values: Array.isArray(values) ? values : [] }
        if (/^\s*(begin|start transaction|commit|rollback)\b/i.test(text)) settings = []
        else if (/^\s*select set_config\(/i.test(text)) settings.push(kept)
        else sent.push({ ...kept, settings: [...settings] })
      }
      return query(text, values)
    }) as typeof client.query
  })
  const explainer = store.pool({ max: 1 })
  const reads = (statement: SentStatement, table: string) => new RegExp(`(from|join|update|into)\\s+("[^"]+"\\.|\\w+\\.)?"?${table}"?[\\s(]`, 'i').test(statement.text)
  const planOf = async (statement: SentStatement) => {
    const client = await explainer.connect()
    try {
      await client.query('begin')
      for (const setting of statement.settings) await client.query(setting.text, setting.values)
      const { rows } = await client.query<{ 'QUERY PLAN': string }>(`explain ${statement.text}`, statement.values)
      return rows.map((row) => row['QUERY PLAN']).join('\n')
    } finally {
      await client.query('rollback')
      client.release()
    }
  }
  const plansOf = async (table: string) => {
    const plans: string[] = []
    for (const statement of sent.filter((kept) => reads(kept, table) && !/^\s*(create|alter|drop)\b/i.test(kept.text))) plans.push(await planOf(statement))
    return plans
  }
  return { dialect: new PostgresDialect({ pool }), sent, plansOf, forget: () => void sent.splice(0) }
}

/** The sequential scans of `table` among `plans`. */
export const seqScansOf = (plans: string[], table: string) => plans.filter((plan) => new RegExp(`Seq Scan on ("?[\\w]+"?\\.)?"?${table}"?\\b`).test(plan))

/**
 * What a table above 30k rows needs before its rows go in, so every run plans alike: no autovacuum to change its
 * statistics mid-test, and `analyze` reading every row of the `columns` the plans read it by.
 */
export const largeTable = (table: string, columns: string[]) =>
  [`alter table ${table} set (autovacuum_enabled = off)`, ...columns.map((column) => `alter table ${table} alter column ${column} set statistics 1000`)].join(';\n')
