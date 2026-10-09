import { CompiledQuery } from 'kysely'
import type { Db } from './db'

export type PlanNode = {
  'Node Type': string
  'Plan Rows': number
  'Relation Name'?: string
  Schema?: string
  Plans?: PlanNode[]
}

/** Plans a compiled query without executing it (EXPLAIN, never ANALYZE; VERBOSE adds each relation's schema). */
export const explainPlan = async (db: Db, compiled: { sql: string; parameters: readonly unknown[] }) => {
  const result = await db.executeQuery(CompiledQuery.raw(`EXPLAIN (VERBOSE, FORMAT JSON) ${compiled.sql}`, [...compiled.parameters]))
  const output = (result.rows[0] as Record<string, unknown>)['QUERY PLAN']
  const parsed = (typeof output === 'string' ? JSON.parse(output) : output) as Array<{ Plan: PlanNode }>
  return parsed[0]!.Plan
}

export const walkPlan = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(walkPlan)]
