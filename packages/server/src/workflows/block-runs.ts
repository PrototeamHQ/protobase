import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { BlockRun, BlockRunStore } from '@protobase/workflows'
import type { JobDefinition } from '../jobs/job-types'

type Row = { id: string; status: BlockRun['status']; output: unknown; error: string | null; cause: string | null; finished_at: Date | null; output_blanked: boolean | null }

const blockRun = (row: Row): BlockRun => ({ id: row.id, status: row.status, output: row.output, error: row.error, cause: row.cause, finishedAt: row.finished_at, blanked: row.output_blanked })

/**
 * Blocks' runs in the `runs` table, found by the run that started each and the try (`block_of`, `block_visit`), which
 * only this store writes. A block's run takes its parent's workflow, version, tenant and trace setting from the
 * parent's own row, never from the caller, and starts only for a Block of that version.
 */
export const postgresBlockRuns = (schema: string, job: () => JobDefinition<{ run: string }> | undefined): BlockRunStore<Db> => {
  const runs = sql.id(schema, 'runs')
  const versions = sql.id(schema, 'versions')
  const find: BlockRunStore<Db>['find'] = async (db, parent, visit) => {
    const { rows } = await sql<Row>`select id, status, output, error, cause, finished_at, output_blanked from ${runs} where block_of = ${parent} and block_visit = ${visit}`.execute(db)
    return rows[0] && blockRun(rows[0])
  }
  return {
    find,
    start: async (db, { parent, visit, state, input }) => {
      // A Block named `state` anywhere in the parent's version, as a key of some `States` whose value is a Block.
      const { rows } = await sql<Row>`insert into ${runs} (workflow_id, version, input, tenant_id, started_by, trace, block_of, block_state, block_visit)
        select p.workflow_id, p.version, ${JSON.stringify(input) ?? null}::jsonb, p.tenant_id, 'run:' || p.id, p.trace, p.id, ${state}, ${visit}
        from ${runs} p join ${versions} v on v.workflow_id = p.workflow_id and v.version = p.version
        where p.id = ${parent} and jsonb_path_exists(v.definition -> 'stateMachine', '$.**.States ? (@.type() == "object").keyvalue() ? (@.key == $name && @.value.Type == "Block")', jsonb_build_object('name', ${state}::text), true)
        on conflict (block_of, block_visit) where block_of is not null do nothing
        returning id, status, output, error, cause, finished_at, output_blanked`.execute(db)
      if (!rows[0]) return find(db, parent, visit)
      await job()!.enqueue(db, { run: rows[0].id }, { key: rows[0].id })
      return blockRun(rows[0])
    },
    count: async (db, parent) => {
      const { rows } = await sql<{ count: number }>`select count(*)::integer as count from ${runs} where block_of = ${parent}`.execute(db)
      return rows[0]!.count
    },
  }
}
