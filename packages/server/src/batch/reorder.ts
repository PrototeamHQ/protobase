import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { encodeKey } from '@protobase/schema'
import type { Deps } from '../deps'
import { badRequest } from '../problem'
import { fetchRecord } from '../records'
import { requireOperation, targetFilter, writableFields, type RequestAccess } from '../request-access'
import { columnId, keyConditions, scopeConditions, tableId, whereClause } from '../sql-parts'
import { tenantScope } from '../tenant'
import { validateBody } from '../validate-body'
import { missing, shown, type WriteResult } from '../write-shared'
import { applyUpdate, planUpdate, type UpdatePlan } from '../write-update'

type Key = (string | number)[]

const checkViolation = '23514'

const isDatabaseCode = (error: unknown, code: string) => error instanceof Error && (error as { code?: unknown }).code === code

/**
 * Moves the affected rows out of the range in use, in one statement per row and without touching their ETags, so the
 * final positions can be written without any two rows colliding on a non-deferrable unique index.
 * First above the highest value in the column; when a check constraint refuses that, below the lowest (negative).
 * The first attempt runs in a savepoint, so a refusal costs nothing.
 */
const moveAside = async (trx: Db, access: RequestAccess, field: string, keys: Key[]) => {
  const { full } = access
  const column = columnId(full.fields[field]!)
  const tenant = tenantScope(access.entry, access.session)?.tenantValue
  const bounds = (await sql<{ high: number | null; low: number | null }>`select max(${column}) as high, min(${column}) as low from ${tableId(full)} as t`.execute(trx)).rows[0]!
  const assign = async (temporary: (rank: number) => number) => {
    for (const [rank, key] of keys.entries()) {
      const conditions = [...scopeConditions(full, tenant), ...keyConditions(full, key)]
      await sql`update ${tableId(full)} as t set ${column} = ${temporary(rank)}${whereClause(conditions)}`.execute(trx)
    }
  }
  await sql`savepoint reorder_aside`.execute(trx)
  try {
    await assign((rank) => Number(bounds.high ?? 0) + 1 + rank)
    await sql`release savepoint reorder_aside`.execute(trx)
  } catch (error) {
    if (!isDatabaseCode(error, checkViolation)) throw error
    await sql`rollback to savepoint reorder_aside`.execute(trx)
    await assign((rank) => Math.min(Number(bounds.low ?? 0), 0) - 1 - rank)
  }
}

/**
 * `reorder`: the listed records end up with `field` = 1, 2, 3, ... in the given order. Only records whose value changes
 * are written, each as an ordinary update (validation, access, ETag, hooks); they are first moved aside (see `moveAside`)
 * so that a unique index such as (invoice_id, position) is never violated half way. Everything checks out before any row moves.
 */
export const reorderIn = async (trx: Db, deps: Deps, access: RequestAccess, input: { field: string; keys: Key[]; etags: Record<string, string> }): Promise<WriteResult[]> => {
  const { entry, full } = access
  requireOperation(access, 'update')
  const field = full.fields[input.field]
  // Refused exactly like any other field the caller cannot write (hidden, read-only or unknown)
  validateBody(access, 'update', { [input.field]: 1 })
  if (field?.type !== 'integer' && field?.type !== 'bigint') throw badRequest('invalid-parameter', `"${input.field}" must be an integer field to order by`)
  if (!writableFields(access, 'update').includes(input.field)) throw badRequest('invalid-parameter', `"${input.field}" is read-only`)
  const names = input.keys.map((key) => encodeKey(key))
  if (new Set(names).size !== names.length) throw badRequest('invalid-parameter', 'A record appears twice in keys')

  const tenant = tenantScope(entry, access.session)?.tenantValue
  const target = targetFilter(access, 'update')
  const current = await Promise.all(input.keys.map(async (key) => {
    const found = await fetchRecord(trx, entry, key, tenant, { deleted: 'hide', lock: true, ...(target && { filter: target }), etagFields: Object.keys(access.model.fields) })
    if (!found) throw missing(entry)
    return found
  }))

  const changing = input.keys.flatMap((key, i) => (Number(current[i]!.record[input.field]) === i + 1 ? [] : [i]))
  const plans = new Map<number, UpdatePlan>()
  for (const i of changing) {
    plans.set(i, await planUpdate(trx, access, input.keys[i]!, { [input.field]: i + 1 }, input.etags[names[i]!] ?? null))
  }
  if (changing.length > 0) await moveAside(trx, access, input.field, changing.map((i) => input.keys[i]!))

  const results: WriteResult[] = []
  for (const [i, key] of input.keys.entries()) {
    const plan = plans.get(i)
    results.push(await shown(access, plan ? await applyUpdate(trx, deps, access, key, plan) : current[i]!))
  }
  return results
}
