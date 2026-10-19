import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { encodeKey } from '@protobase/schema/internal'
import type { Deps } from './deps'
import { checkedFilter } from './filter-input'
import { HttpProblem } from './problem'
import type { RequestAccess } from './request-access'
import { columnId, filterCondition, scopeConditions, tableId, whereClause } from './sql-parts'
import { tenantScope } from './tenant'
import { newlyAbove, type RankPair } from './rank-pairs'

/** A record a reorder changed, with the rank it had before. */
export type Moved = { key: (string | number)[]; before: unknown }

/**
 * Refuses a reorder by the resource's position that puts a record at or above a record it depends on, or one of those
 * at or below it (see `PositionAfterModel`), in one query of the pairs that involve the changed records. Pairs out of
 * order before the reorder do not count, so existing data never blocks a move that did not break it.
 */
export const checkRankAfter = async (trx: Db, deps: Deps, access: RequestAccess, field: string, moved: Moved[]) => {
  const { full, entry, session } = access
  const after = full.position?.after
  if (!after || full.position!.field !== field || moved.length === 0) return
  const via = deps.registry.find(after.resource)!.model
  const id = columnId(full.fields[full.primaryKey[0]!]!)
  const rank = columnId(full.fields[field]!)
  const from = columnId(via.fields[after.field]!)
  const to = columnId(via.fields[after.key]!)
  const keys = sql.join(moved.map((record) => record.key[0]!))

  const links = [
    ...scopeConditions(via, tenantScope(deps.registry.find(after.resource)!, session)?.tenantValue),
    ...filterCondition(via, checkedFilter(via, after.filter)),
    sql<boolean>`(${from} in (${keys}) or ${to} in (${keys}))`,
  ]
  const tenant = tenantScope(entry, session)?.tenantValue
  const ranked = (pending: boolean) => {
    const conditions = [...scopeConditions(full, tenant), ...(pending ? filterCondition(full, checkedFilter(full, after.while)) : [])]
    return sql`(select ${id} as id, ${rank} as rank from ${tableId(full)} as t${whereClause(conditions)})`
  }
  const { rows } = await sql<RankPair>`select l.dependent, l.depended, d.rank as dependent_rank, p.rank as depended_rank
    from (select ${from} as dependent, ${to} as depended from ${tableId(via)} as t${whereClause(links)}) as l
    join ${ranked(false)} as d on d.id = l.dependent
    join ${ranked(true)} as p on p.id = l.depended`.execute(trx)

  const broken = newlyAbove(rows, new Map(moved.map((record) => [encodeKey(record.key), record.before])))
  if (!broken) return
  throw new HttpProblem(409, 'ranks-above-dependency', 'Conflict', `${entry.name} ${broken.dependent} cannot rank above ${broken.depended}, which it depends on`, {
    record: broken.dependent,
    dependsOn: broken.depended,
  })
}
