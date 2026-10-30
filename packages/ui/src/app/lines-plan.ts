import type { BatchOp, BatchRef } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { differs, toPatchValue } from '../live/field-values'
import { recordId, recordKey } from '../live/model-helpers'

type Line = Record<string, unknown>

/** What the person changed in a record's lines and has not saved: their order, new lines, edited fields and removed lines. */
export type LinesState = {
  /** The ids in the order on screen, once a line was moved; new lines have ids of their own until saved. */
  order?: string[]
  /** The new lines' ids, in the order they were added. */
  added: string[]
  /** Per line id, the fields as typed, the way a form holds them. */
  edits: Record<string, Record<string, unknown>>
  removed: string[]
}

export const emptyLinesState: LinesState = { added: [], edits: {}, removed: [] }

/** The batch that saves the lines, and per operation the id of the line it writes, none for a reorder. */
export type LinesPlan = { ops: BatchOp[]; rows: Array<string | undefined> }

export type LinesPlanInput = {
  model: ResourceModel
  /** The integer field that holds the lines' order. */
  position: string
  /** The relation to the record the lines belong to, and that record's key, which a new line gets. */
  link: { field: string; value: unknown }
  /** The lines as the server has them, in their order. */
  stored: Line[]
  state: LinesState
}

/** The ids on screen, in order: the stored lines that are kept, then the new ones, as far as `order` does not say otherwise. */
export const shownIds = (storedIds: string[], state: LinesState) => {
  const kept = [...storedIds.filter((id) => !state.removed.includes(id)), ...state.added]
  if (!state.order) return kept
  return [...state.order.filter((id) => kept.includes(id)), ...kept.filter((id) => !state.order!.includes(id))]
}

/** The edited fields that differ from the stored line, as the API takes them. */
const changedData = (model: ResourceModel, edits: Record<string, unknown>, line: Line) =>
  Object.fromEntries(
    Object.entries(edits).flatMap(([name, draft]) => {
      const field = model.fields[name]
      return field && differs(field, draft, line[name]) ? [[name, toPatchValue(field, draft)]] : []
    }),
  )

/** The fields filled in on a new line; the database's defaults fill the rest. */
const filledData = (model: ResourceModel, edits: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(edits).flatMap(([name, draft]) => {
      const field = model.fields[name]
      if (!field || (field.type !== 'boolean' && String(draft ?? '').trim() === '')) return []
      return [[name, toPatchValue(field, draft)]]
    }),
  )

/**
 * The batch that writes the lines as they are on screen: removed lines are deleted, edited ones updated with the ETag
 * they were read with, and new ones created with the parent's key and their place. New lines after the kept ones are
 * numbered on from them; new lines between kept ones need the kept ones out of the way first, so those are moved above
 * every position in use, the new lines created at their places, and the kept ones moved to theirs. A kept line the batch
 * wrote before is moved with `*`, as its ETag was checked by that earlier operation of the same transaction.
 */
export const planLinesOps = ({ model, position, link, stored, state }: LinesPlanInput): LinesPlan => {
  const plan: LinesPlan = { ops: [], rows: [] }
  const push = (op: BatchOp, row?: string) => {
    plan.ops.push(op)
    plan.rows.push(row)
  }
  const byId = new Map(stored.map((line) => [recordId(model, line), line]))
  const storedIds = [...byId.keys()]
  const final = shownIds(storedIds, state)
  const keyOf = (id: string) => recordKey(model, byId.get(id)!)
  const etagOf = (id: string) => {
    const etag = byId.get(id)!.etag
    return typeof etag === 'string' ? etag : undefined
  }

  for (const id of state.removed) {
    if (!byId.has(id)) continue
    const etag = etagOf(id)
    push({ op: 'delete', resource: model.name, key: keyOf(id), ...(etag && { etag }) }, id)
  }

  const written = new Set<string>()
  for (const [id, edits] of Object.entries(state.edits)) {
    if (!byId.has(id) || state.removed.includes(id)) continue
    const data = changedData(model, edits, byId.get(id)!)
    if (Object.keys(data).length === 0) continue
    const etag = etagOf(id)
    push({ op: 'update', resource: model.name, key: keyOf(id), data, ...(etag && { etag }) }, id)
    written.add(id)
  }

  const kept = final.filter((id) => byId.has(id))
  const added = final.filter((id) => !byId.has(id))
  const etags = (ids: string[], wildcard: boolean) =>
    Object.fromEntries(
      ids.flatMap((id) => {
        const etag = wildcard || written.has(id) ? '*' : etagOf(id)
        return etag ? [[encodeKey(keyOf(id)), etag]] : []
      }),
    )
  const reorder = (keys: Array<ReturnType<typeof keyOf> | BatchRef>, start: number, tags: Record<string, string>): BatchOp => ({
    op: 'reorder',
    resource: model.name,
    field: position,
    keys,
    ...(start !== 1 && { start }),
    etags: tags,
  })
  const create = (id: string, place: number, ref?: string): BatchOp => ({
    op: 'create',
    resource: model.name,
    data: { ...filledData(model, state.edits[id] ?? {}), [link.field]: link.value, [position]: place },
    ...(ref && { ref }),
  })
  const placeOf = (line: Line) => Number(line[position]) || 0

  const moved = kept.some((id, index) => id !== storedIds.filter((each) => kept.includes(each))[index])
  const atEnd = added.every((id) => final.indexOf(id) >= kept.length)
  if (atEnd) {
    if (moved) push(reorder(kept.map(keyOf), 1, etags(kept, false)))
    const last = moved ? kept.length : Math.max(0, ...kept.map((id) => placeOf(byId.get(id)!)))
    added.forEach((id, index) => push(create(id, last + 1 + index), id))
    return plan
  }

  const above = Math.max(final.length, ...stored.map(placeOf)) + 1
  if (kept.length > 0) push(reorder(kept.map(keyOf), above, etags(kept, false)))
  const refOf = (id: string) => `line${added.indexOf(id) + 1}`
  for (const id of added) push(create(id, final.indexOf(id) + 1, refOf(id)), id)
  push(reorder(final.map((id) => (byId.has(id) ? keyOf(id) : { $ref: refOf(id) })), 1, etags(kept, true)))
  return plan
}
