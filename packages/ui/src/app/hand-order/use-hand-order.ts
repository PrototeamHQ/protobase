import { arrayMove } from '@dnd-kit/sortable'
import { useQuery } from '@tanstack/react-query'
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
import { useAdminMeta } from '../meta-gate'
import { useRefreshResource } from '../pages/use-layout-data'
import { handOrderLimit } from './hand-order'
import { text } from './messages'

type Request = { model: ResourceModel; field: string; filter: string; fields: string[] }

/**
 * The records of `filter` in the order of `field`, all of them up to `handOrderLimit`, with `more` when there are
 * others, and `move` to put one elsewhere. A move shows at once and renumbers them all 1, 2, 3, ... in one batch
 * `reorder` with their ETags; moves made while one saves are saved after it, with the ETags it gave back. A refusal
 * puts them back as the server has them and says why; either way every list of the resource reloads.
 */
export const useHandOrder = ({ model, field, filter, fields }: Request) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const { resources, views } = useAdminMeta()
  const orderBy = `${field} asc`
  const loaded = useQuery({
    queryKey: [...keys.list(model.name, filter, orderBy, handOrderLimit, 'hand-order'), fields.join(',')],
    queryFn: async () => {
      const labels = listLabels(resources, views, model, fields)
      const page = await client.search(model.name, { filter: filter || undefined, orderBy, pageSize: handOrderLimit, labels })
      const rows: GridRow[] = withLabels(resources, model, fields, page.items, page.labels).map((row, index) => ({ ...row, id: recordId(model, page.items[index]!) }))
      return { rows, more: Boolean(page.nextPageToken) }
    },
  })
  // The order on screen while moves save, then the server's again
  const [moved, setMoved] = useState<GridRow[]>()
  const latest = useRef<GridRow[]>(undefined)
  const saving = useRef(Promise.resolve())
  const waiting = useRef(0)

  const save = async () => {
    const rows = latest.current
    // An earlier move was refused, which put the records back
    if (!rows) return
    const etags = Object.fromEntries(rows.flatMap((row) => (typeof row.etag === 'string' ? [[encodeKey(recordKey(model, row)), row.etag]] : [])))
    const result = await client.batchWrite([{ op: 'reorder', resource: model.name, field, keys: rows.map((row) => recordKey(model, row)), etags }])
    const written = result.results[0]
    if (written?.op !== 'reorder' || !latest.current) return
    const stored = new Map(written.records.map((entry) => [recordId(model, entry.record), entry]))
    // Moves made since keep their order, each record with the ETag and position the server gave it
    latest.current = latest.current.map((row) => {
      const entry = stored.get(row.id)
      return entry ? { ...row, [field]: entry.record[field], etag: entry.etag } : row
    })
  }

  const refused = (error: unknown) => {
    latest.current = undefined
    setMoved(undefined)
    toast.show({ state: 'error', title: text('couldNotChange'), description: refusalReason(error) })
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

  const move = (from: number, to: number) => {
    const rows = latest.current ?? loaded.data?.rows
    if (!rows || from === to) return
    latest.current = arrayMove(rows, from, to)
    setMoved(latest.current)
    waiting.current += 1
    saving.current = saving.current.then(save).catch(refused).then(settle)
  }

  return { rows: moved ?? loaded.data?.rows, more: loaded.data?.more ?? false, loading: loaded.isPending, error: loaded.error, move }
}
