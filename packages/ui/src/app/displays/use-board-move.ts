import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { KeyValue, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { recordKey } from '../../live/model-helpers'
import { useToast } from '../../toasts'
import { undoOps, type DragWrite } from '../hand-order/undo-ops'
import { useRefreshResource } from '../pages/use-layout-data'
import { refusalReason, type BoardColumn } from './board-columns'
import { boardWrites, placeOps } from './board-place'
import type { ListDisplayRow } from './list-displays'
import { text } from './messages'

/**
 * A card on its way to another column or place: the record as it will be, shown there until the columns have reloaded,
 * and on a ranked board the keys of the column's cards in their new order.
 */
export type BoardMove = { row: ListDisplayRow; to: string | null; order?: string[] }

/** Where in its column a card on a ranked board is dropped: the column's cards in their new order, and the first and last place that changed. */
export type BoardPlacing = { order: ListDisplayRow[]; first: number; last: number }

type Move = { row: ListDisplayRow; to: BoardColumn; place?: BoardPlacing }

/**
 * Moving a board's card to another column: one update of the record with the column's value and the ETag it was listed
 * with, as a named update action sends, so the resource's access rules and `validate` decide. On a ranked board a drop
 * at a place is one batch instead, that update when the column changes and a `reorder` by `rank` of the column's cards.
 * The card shows in its new place at once; a saved move says so with **Undo**, which puts back the values it changed,
 * and a refusal puts it back and says why. Either way every list of the resource reloads.
 */
export const useBoardMove = (model: ResourceModel, by: string, rank?: string) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const [moves, setMoves] = useState<BoardMove[]>([])
  // Only the latest move can be undone, so its toast replaces the one before
  const undoToast = useRef<number>(undefined)
  const settle = (key: string) => setMoves((current) => current.filter((move) => move.row.key !== key))
  const fields = rank ? [by, rank] : [by]

  const undo = useMutation({
    mutationFn: (writes: DragWrite[]) => client.batchWrite(undoOps(model, writes, fields)),
    onError: (error) => toast.show({ state: 'error', title: text('couldNotUndo'), description: refusalReason(error) }),
    onSettled: () => refresh(model.name),
  })

  const mutation = useMutation({
    mutationFn: async ({ row, to, place }: Move): Promise<DragWrite[]> => {
      if (place && !rank) throw new Error('A board places a card only by its rank')
      if (place) return boardWrites(model, place.order, await client.batchWrite(placeOps(model, by, rank!, row, to, place.order, place.first, place.last)))
      const etag = typeof row.record.etag === 'string' ? row.record.etag : '*'
      const stored = await client.update(model.name, recordKey(model, row.record) as KeyValue, { [by]: to.value }, etag)
      return [{ before: row.record, record: stored.record, etag: stored.etag }]
    },
    onMutate: ({ row, to, place }) => {
      const moved = { ...row, record: { ...row.record, [by]: to.value } }
      const order = place?.order.map((entry) => entry.key)
      setMoves((current) => [...current.filter((move) => move.row.key !== row.key), { row: moved, to: to.value, ...(order && { order }) }])
    },
    onSuccess: (writes, { row, to }) => {
      if (undoToast.current !== undefined) toast.dismiss(undoToast.current)
      const title = (row.record[by] ?? null) === to.value ? text('orderChanged') : text('movedTo', to.label)
      const id = toast.show({
        state: 'success',
        title,
        action: {
          label: text('undo'),
          onClick: () => {
            toast.dismiss(id)
            undoToast.current = undefined
            undo.mutate(writes)
          },
        },
      })
      undoToast.current = id
    },
    onError: (error, { row, to }) => {
      settle(row.key)
      const title = (row.record[by] ?? null) === to.value ? 'Could not change the order' : `Could not move it to ${to.label}`
      toast.show({ state: 'error', title, description: refusalReason(error) })
    },
    onSettled: async (_result, _error, { row }) => {
      await refresh(model.name)
      settle(row.key)
    },
  })

  return { moves, move: (row: ListDisplayRow, to: BoardColumn, place?: BoardPlacing) => mutation.mutate({ row, to, ...(place && { place }) }) }
}
