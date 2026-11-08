import { arrayMove } from '@dnd-kit/sortable'
import { useQuery } from '@tanstack/react-query'
import type { BatchOp } from '@protobase/client'
import { useRef, useState } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { GridRow } from '../../data-grid'
import { recordId, recordTitle } from '../../live/model-helpers'
import { listLabels, withLabels } from '../../live/relation-labels'
import { useToast } from '../../toasts'
import { displayRow } from '../displays/list-displays'
import { useAdminMeta } from '../meta-gate'
import { useRefreshResource } from '../pages/use-layout-data'
import { dependencyRule } from '../rank-after/dependency-rule'
import { rankBounds } from '../rank-after/rank-bounds'
import { anchoredMove } from './anchored-move'
import { allowedDrop, type DropRule } from './drop-rule'
import { handOrderPage } from './hand-order'
import { text } from './messages'
import { moveRefusal } from './move-refusal'
import { undoOps } from './undo-ops'

type Request = { model: ResourceModel; view: ViewModel | undefined; field: string; filter: string; fields: string[]; rule?: DropRule }

/**
 * The records of `filter` in the order of `field`, all of them, a page of `handOrderPage` at a time, and `move` to put
 * one elsewhere. A move shows at once and saves as a batch `move` anchored to where it was dropped (see `anchoredMove`),
 * so it saves whatever else changed meanwhile; moves made while one saves are saved after it, together.
 * Each save says so with **Undo**, which puts back the values it changed. A refusal puts them back as the server has
 * them and says why, or that the list changed where it was dropped; either way every list of the resource reloads. A drop `rule` refuses moves to the first place below
 * that it allows, with a warning giving its reason; with the position's `after`, so do the records the moved one
 * depends on, read first (see `rankBounds`).
 */
export const useHandOrder = ({ model, view, field, filter, fields, rule }: Request) => {
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
  // The moves not saved yet, in the order they were made
  const pending = useRef<BatchOp[]>([])
  const saving = useRef(Promise.resolve())
  const waiting = useRef(0)
  // Only the latest save can be undone, so its toast replaces the one before
  const undoToast = useRef<number>(undefined)

  const save = async () => {
    const rows = latest.current
    const ops = pending.current
    pending.current = []
    // An earlier move was refused, which put the records back, or an earlier save took this move along
    if (!rows || ops.length === 0) return
    const result = await client.batchWrite(ops)
    // Each record as the last move that numbered it left it
    const stored = new Map(result.results.flatMap((written) => (written.op === 'move' ? written.records : [])).map((entry) => [recordId(model, entry.record), entry]))
    // Moves change only the order on screen, so the rows still have the values this save replaces
    const before = new Map(rows.map((row) => [row.id, { [field]: row[field] }]))
    const undo = undoOps(model, [...stored].map(([id, entry]) => ({ ...entry, before: before.get(id) ?? {} })), [field])
    if (undoToast.current !== undefined) toast.dismiss(undoToast.current)
    undoToast.current = toast.show({ state: 'success', title: text('orderChanged'), action: { label: text('undo'), onClick: () => undoSave(undo) } })
    if (!latest.current) return
    // Moves made since keep their order, each record with the ETag and position the server gave it
    latest.current = latest.current.map((row) => {
      const entry = stored.get(row.id)
      return entry ? { ...row, [field]: entry.record[field], etag: entry.etag } : row
    })
  }

  const refused = (title: string) => (error: unknown) => {
    latest.current = undefined
    pending.current = []
    setMoved(undefined)
    toast.show({ state: 'error', ...moveRefusal(error, title) })
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
    if (!model.position?.after) return place(rows, from, dropped, rule)
    const record = displayRow(model, rows[from]!).record
    const id = rows[from]!.id
    rankBounds(client, model, view, record).then((bounds) => {
      // Moves saved meanwhile may have moved the row
      const now = latest.current ?? loaded.data!
      const dependencies = dependencyRule(model, bounds, recordTitle(model, view, record, id))
      place(now, now.findIndex((row) => row.id === id), dropped, (drop) => dependencies(drop) ?? rule?.(drop))
    }, refused(text('couldNotChange')))
  }

  const place = (rows: GridRow[], from: number, dropped: number, rule: DropRule | undefined) => {
    if (from === -1 || from === dropped) return
    const to = rule ? placeAllowed(rows, from, dropped, rule) : dropped
    if (from === to) return
    latest.current = arrayMove(rows, from, to)
    pending.current = [...pending.current, anchoredMove(model, field, filter, latest.current, to)]
    setMoved(latest.current)
    waiting.current += 1
    saving.current = saving.current.then(save).catch(refused(text('couldNotChange'))).then(settle)
  }

  // Where the rule lets the row land, warning when that is not where it was dropped
  const placeAllowed = (rows: GridRow[], from: number, dropped: number, rule: DropRule) => {
    const allowed = allowedDrop(rows.map((row) => displayRow(model, row).record), from, dropped, rule)
    if (allowed.reason !== undefined) toast.show({ state: 'warning', title: allowed.to === from ? text('notMoved') : text('movedToPlace', { place: allowed.to + 1 }), description: allowed.reason })
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
        pending.current = []
        setMoved(undefined)
      })
      .catch(refused(text('couldNotUndo')))
      .then(settle)
  }

  return { rows: moved ?? loaded.data, loading: loaded.isPending, error: loaded.error, move }
}
