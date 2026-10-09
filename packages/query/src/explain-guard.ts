import { sql, type Compilable, type CompiledQuery } from 'kysely'
import type { Db } from './db'
import { quoteIdent } from './db'
import { explainPlan, walkPlan } from './explain'
import { toNumber } from './numbers'

export type GuardOptions = {
  /** A Seq Scan on a table with more rows than this is a finding. */
  seqScanRows?: number
  /** A Sort over more rows than this is a finding. */
  sortRows?: number
}
export type GuardFinding = { kind: 'seqScan' | 'sort'; relation?: string; rows: number }
export type GuardReport = { ok: boolean; findings: GuardFinding[] }

const relationRows = async (db: Db, schema: string | undefined, relation: string, planRows: number) => {
  const qualified = schema ? `${quoteIdent(schema)}.${quoteIdent(relation)}` : quoteIdent(relation)
  const result = await sql<{ reltuples: unknown }>`
    select reltuples::float8 as reltuples from pg_class where oid = to_regclass(${qualified})
  `.execute(db)
  const reltuples = toNumber(result.rows[0]?.reltuples ?? -1)
  return reltuples >= 0 ? reltuples : planRows
}

/** Plans the query (never executes it) and reports expensive nodes (Seq Scan and Parallel Seq Scan). Pass a Kysely query or a compiled one. */
export const explainGuard = async (db: Db, query: Compilable<unknown> | CompiledQuery, options: GuardOptions = {}): Promise<GuardReport> => {
  const { seqScanRows = 10_000, sortRows = 100_000 } = options
  const compiled = 'sql' in query ? query : query.compile()
  const nodes = walkPlan(await explainPlan(db, compiled))
  const findings: GuardFinding[] = []
  for (const node of nodes) {
    const type = node['Node Type']
    const relation = node['Relation Name']
    if (type.endsWith('Seq Scan') && relation) {
      const rows = await relationRows(db, node.Schema, relation, node['Plan Rows'])
      if (rows > seqScanRows) findings.push({ kind: 'seqScan', relation, rows })
    }
    if ((type === 'Sort' || type === 'Incremental Sort') && node['Plan Rows'] > sortRows) {
      findings.push({ kind: 'sort', rows: node['Plan Rows'] })
    }
  }
  return { ok: findings.length === 0, findings }
}
