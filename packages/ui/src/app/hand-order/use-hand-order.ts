import { arrayMove } from '@dnd-kit/sortable'
import { useQuery } from '@tanstack/react-query'
import type { BatchOp } from '@protobase/client'
import { useRef, useState } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { GridRow } from '../../data-grid'
import { recordId, recordKey } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { useToast } from '../../toasts'
import { refusalReason } from '../displays/board-columns'
import { displayRow } from '../displays/list-displays'
import { useAdminMeta } from '../meta-gate'
import { useRefreshResource } from '../pages/use-layout-data'
import { allowedDrop, type DropRule } from './drop-rule'
import { handOrderPage } from './hand-order'
import { text } from './messages'
import { reorderSpan } from './reorder-span'
import { undoOps } from './undo-ops'

type Request = { model: ResourceModel; field: string; filter: string; fields: string[]; rule?: DropRule }

/**
 * The records of `filter` in the order of `field`, all of them, a page of `handOrderPage` at a time, and `move` to put
 * one elsewhere. A move shows at once and saves only the records whose place changed (see `reorderSpan`) in one batch
 * `reorder` with their ETags; moves made while one saves are saved after it, with the values and ETags it gave back.
 * Each save says so with **Undo**, which puts back the values it changed. A refusal puts them back as the server has
 * them and says why; either way every list of the resource reloads. A drop `rule` refuses moves to the first place below
 * that it allows, with a warning giving its reason.
 */
export const useHandOrder = ({ model, field, filter, fields, rule }: Request) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const { resources, views } = useAdminMeta()
  const orderBy = `${field} asc`
  const loaded = useQuery({
    queryKey: [...keys.list(model.name, filter, orderBy, handOrderPage, 'hand-order'), fields.join(',')],
    queryFn: async () => {
      const labels = listLabels(resources, views, model, fields)
      const rows: GridRow[] = []
      let pageToken = ''
      do {
        const page = await client.search(model.name, { filter: filter || undefined, orderBy, pageSize: handOrderPage, labels, ...(pageToken && { pageToken }) })
        rows.push(...withLabels(resources, model, fields, page.items, page.labels).map((row, index) => ({ ...row, id: recordId(model, page.items[index]!) })))
        pageToken = page.nextPageToken
      } while (pageToken)
      return rows
    },
  })
  // The order on screen while moves save, then the server's again
  const [moved, setMoved] = useState<GridRow[]>()
  const latest = useRef<GridRow[]>(undefined)
  // The places changed by the moves not saved yet, from the first to the last
  const pending = useRef<{ first: number; last: number }>(undefined)
  const saving = useRef(Promise.resolve())
  const waiting = useRef(0)
  // Only the latest save can be undone, so its toast replaces the one before
  const undoToast = useRef<number>(undefined)

  const save = async () => {
    const rows = latest.current
    const changed = pending.current
    pending.current = undefined
    // An earlier move was refused, which put the records back, or an earlier save took this move along
    if (!rows || !changed) return
    const span = reorderSpan(rows.map((row) => row[field]), changed.first, changed.last)
    const sent = rows.slice(span.first, span.last + 1)
    const etags = Object.fromEntries(sent.flatMap((row) => (typeof row.etag === 'string' ? [[encodeKey(recordKey(model, row)), row.etag]] : [])))
    const result = await client.batchWrite([{ op: 'reorder', resource: model.name, field, keys: sent.map((row) => recordKey(model, row)), start: span.start, etags }])
    const written = result.results[0]
    if (written?.op !== 'reorder') return
    const before = new Map(sent.map((row) => [row.id, { [field]: row[field] }]))
    const undo = undoOps(model, written.records.map((entry) => ({ ...entry, before: before.get(recordId(model, entry.record)) ?? {} })), [field])
    if (undoToast.current !== undefined) toast.dismiss(undoToast.current)
    undoToast.current = toast.show({ state: 'success', title: text('orderChanged'), action: { label: text('undo'), onClick: () => undoSave(undo) } })
    if (!latest.current) return
    const stored = new Map(written.records.map((entry) => [recordId(model, entry.record), entry]))
    // Moves made since keep their order, each record with the ETag and position the server gave it
    latest.current = latest.current.map((row) => {
      const entry = stored.get(row.id)
      return entry ? { ...row, [field]: entry.record[field], etag: entry.etag } : row
    })
  }

  const refused = (title: string) => (error: unknown) => {
    latest.current = undefined
    pending.current = undefined
    setMoved(undefined)
    toast.show({ state: 'error', title, description: refusalReason(error) })
  }

  // The server's order again once no move waits to be saved
  const settle = async () => {
    waiting.current -= 1
    if (waiting.current > 0) return
    await refresh(model.name)
    if (waiting.current > 0) return
    latest.current = undefined
    setMoved(undefined)
  }

  const move = (from: number, dropped: number) => {
    const rows = latest.current ?? loaded.data
    if (!rows || from === dropped) return
    const to = rule ? placeAllowed(rows, from, dropped, rule) : dropped
    if (from === to) return
    latest.current = arrayMove(rows, from, to)
    const first = Math.min(from, to)
    const last = Math.max(from, to)
    pending.current = pending.current ? { first: Math.min(pending.current.first, first), last: Math.max(pending.current.last, last) } : { first, last }
    setMoved(latest.current)
    waiting.current += 1
    saving.current = saving.current.then(save).catch(refused(text('couldNotChange'))).then(settle)
  }

  // Where the rule lets the row land, warning when that is not where it was dropped
  const placeAllowed = (rows: GridRow[], from: number, dropped: number, rule: DropRule) => {
    const allowed = allowedDrop(rows.map((row) => displayRow(model, row).record), from, dropped, rule)
    if (allowed.reason !== undefined) toast.show({ state: 'warning', title: allowed.to === from ? text('notMoved') : text('movedToPlace', allowed.to + 1), description: allowed.reason })
    return allowed.to
  }

  // After the saves before it, so a move saved since makes its ETags stale and it is refused
  const undoSave = (ops: BatchOp[]) => {
    if (undoToast.current !== undefined) toast.dismiss(undoToast.current)
    undoToast.current = undefined
    waiting.current += 1
    saving.current = saving.current
      .then(async () => {
        await client.batchWrite(ops)
        // The order is the server's again, which the lists show once they reload
        latest.current = undefined
        pending.current = undefined
        setMoved(undefined)
      })
      .catch(refused(text('couldNotUndo')))
      .then(settle)
  }

  return { rows: moved ?? loaded.data, loading: loaded.isPending, error: loaded.error, move }
}
