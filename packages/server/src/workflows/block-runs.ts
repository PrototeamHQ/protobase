import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { BlockRun, BlockRunStore, BlockShare } from '@protobase/workflows'
import type { JobDefinition } from '../jobs/job-types'
import { whoOf } from './cache/cache-who'
import { runSaverRoles } from './cache/saver-roles'
import type { SaverRoles } from './plugin-records'

type Row = { id: string; status: BlockRun['status']; output: unknown; error: string | null; cause: string | null; finished_at: Date | null; output_blanked: boolean | null; joined?: boolean }

const blockRun = (row: Row): BlockRun => ({ id: row.id, status: row.status, output: row.output, error: row.error, cause: row.cause, finishedAt: row.finished_at, blanked: row.output_blanked, ...(row.joined && { joined: true }) })

/**
 * Blocks' runs in the `runs` table, found by the run that started each and the try (`block_of`, `block_visit`), which
 * only this store writes. A block's run takes its parent's workflow, version, tenant and trace setting from the
 * parent's own row, never from the caller, and starts only for a Block of that version. A run started with `share`
 * keeps its key and a digest of the identity the step cache keeps its result under (`whoOf`, which holds the tenant),
 * and a try of the same key and identity joins it while it is under way, through `block_waiters`. As the step cache,
 * none is shared while the saver holds no role. `roles` gives the roles a saver holds now.
 */
export const postgresBlockRuns = (schema: string, job: () => JobDefinition<{ run: string }> | undefined, roles: SaverRoles): BlockRunStore<Db> => {
  const runs = sql.id(schema, 'runs')
  const versions = sql.id(schema, 'versions')
  const waiters = sql.id(schema, 'block_waiters')
  const columns = sql`r.id, r.status, r.output, r.error, r.cause, r.finished_at, r.output_blanked`
  const own = async (db: Db, parent: string, visit: string) => {
    const { rows } = await sql<Row>`select ${columns} from ${runs} r where r.block_of = ${parent} and r.block_visit = ${visit}`.execute(db)
    return rows[0] && blockRun(rows[0])
  }
  const find: BlockRunStore<Db>['find'] = async (db, parent, visit) => {
    const { rows } = await sql<Row>`select ${columns}, false as joined from ${runs} r where r.block_of = ${parent} and r.block_visit = ${visit}
      union all select ${columns}, true from ${waiters} w join ${runs} r on r.id = w.run_id where w.parent = ${parent} and w.visit = ${visit}
      order by joined limit 1`.execute(db)
    return rows[0] && blockRun(rows[0])
  }
  // The identity a run shares under, as the step cache keeps a block's entry; undefined while the saver holds no role.
  // A failing roles lookup fails the step rather than sharing or starting under an identity it could not tell.
  const sharedWho = async (db: Db, parent: string, share: BlockShare) => {
    const held = share.identity.saver ? await runSaverRoles(db, schema, roles, parent) : []
    if (share.identity.saver && held.length === 0) return
    return whoOf(schema, parent, share.identity, held)
  }
  // Joins the run of `key` under way for the same identity and tenant: its row, which may have ended meanwhile, so the
  // try takes its outcome at once rather than waiting for a wake that read the waiters before this one was there.
  const join = async (db: Db, parent: string, visit: string, key: string, who: NonNullable<Awaited<ReturnType<typeof sharedWho>>>) => {
    await sql`with who as (${who})
      insert into ${waiters} (parent, visit, run_id)
      select ${parent}, ${visit}, r.id from ${runs} r, who
      where r.block_key = ${key} and r.block_who = encode(sha256(convert_to(who.who::text, 'UTF8')), 'hex') and r.tenant_id is not distinct from who.tenant_id
        and r.status in ('queued', 'running', 'waiting')
      on conflict (parent, visit) do nothing`.execute(db)
    return find(db, parent, visit)
  }
  const insert = async (db: Db, { parent, visit, state, input, who, key }: { parent: string; visit: string; state: string; input: unknown; who?: Awaited<ReturnType<typeof sharedWho>>; key?: string }) => {
    // A Block named `state` anywhere in the parent's version, as a key of some `States` whose value is a Block.
    const values = sql`select p.workflow_id, p.version, ${JSON.stringify(input) ?? null}::jsonb as input, p.tenant_id, 'run:' || p.id as started_by, p.trace, p.id as block_of, ${state}::text as block_state, ${visit}::text as block_visit
        from ${runs} p join ${versions} v on v.workflow_id = p.workflow_id and v.version = p.version
        where p.id = ${parent} and jsonb_path_exists(v.definition -> 'stateMachine', '$.**.States ? (@.type() == "object").keyvalue() ? (@.key == $name && @.value.Type == "Block")', jsonb_build_object('name', ${state}::text), true)`
    const returning = sql`returning id, status, output, error, cause, finished_at, output_blanked`
    if (!who || key === undefined) {
      const { rows } = await sql<Row>`insert into ${runs} (workflow_id, version, input, tenant_id, started_by, trace, block_of, block_state, block_visit)
        ${values}
        on conflict (block_of, block_visit) where block_of is not null do nothing
        ${returning}`.execute(db)
      return { row: rows[0], block: true }
    }
    const { rows } = await sql<Row>`with who as (${who})
      insert into ${runs} (workflow_id, version, input, tenant_id, started_by, trace, block_of, block_state, block_visit, block_key, block_who)
      select s.*, ${key}, encode(sha256(convert_to(who.who::text, 'UTF8')), 'hex') from (${values}) s, who
      on conflict (block_key, block_who) where block_key is not null and block_who is not null and status in ('queued', 'running', 'waiting') do nothing
      ${returning}`.execute(db)
    if (rows[0]) return { row: rows[0], block: true }
    const { rows: found } = await sql<{ block: boolean }>`select exists (${values}) as block`.execute(db)
    return { row: undefined, block: found[0]!.block }
  }
  return {
    find,
    start: async (db, { parent, visit, state, input, share, joinOnly }) => {
      const started = await own(db, parent, visit)
      if (started) return started
      const who = share && (await sharedWho(db, parent, share))
      if (joinOnly) return who && share ? join(db, parent, visit, share.key, who) : undefined
      // A run of the key under way is joined; one that ended between the insert and the join leaves its place free, so
      // the insert is tried once more, and a second miss is an error rather than a try without a run.
      for (let attempt = 0; attempt < 2; attempt++) {
        const { row, block } = await insert(db, { parent, visit, state, input, ...(who && share && { who, key: share.key }) })
        if (row) {
          await job()!.enqueue(db, { run: row.id }, { key: row.id })
          return blockRun(row)
        }
        if (!who || !share) return own(db, parent, visit)
        if (!block) return
        const joined = await join(db, parent, visit, share.key, who)
        if (joined) return joined
      }
      throw new Error('The run of a block with this key that was under way ended before it could be joined, twice')
    },
    waiters: async (db, run) => {
      const { rows } = await sql<{ parent: string }>`select parent from ${waiters} where run_id = ${run}`.execute(db)
      return rows.map((row) => row.parent)
    },
    count: async (db, parent) => {
      const { rows } = await sql<{ count: number }>`select count(*)::integer as count from ${runs} where block_of = ${parent}`.execute(db)
      return rows[0]!.count
    },
  }
}
