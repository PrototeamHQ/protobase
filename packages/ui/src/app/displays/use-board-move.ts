import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { KeyValue, ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { recordKey } from '../../live/model-helpers'
import { useToast } from '../../toasts'
import { text as orderText } from '../hand-order/messages'
import { undoOps, type DragWrite } from '../hand-order/undo-ops'
import { useRefreshResource } from '../pages/use-layout-data'
import { rankBounds } from '../rank-after/rank-bounds'
import { rankedPlace, type RankedPlace } from '../rank-after/ranked-place'
import { refusalReason, type BoardColumn } from './board-columns'
import { dropWrite, type BoardDrop } from './board-drop'
import { boardWrites, placeOps, placing, type BoardPlace } from './board-place'
import type { ListDisplayRow } from './list-displays'
import { text } from './messages'

/**
 * A card on its way to another column or place: the record as it will be, shown there until the columns have reloaded,
 * and on a ranked board the keys of the column's cards in their new order.
 */
export type BoardMove = { row: ListDisplayRow; to: string | null; order?: string[] }

type Move = { row: ListDisplayRow; to: BoardColumn; place?: Omit<BoardPlace, 'column'> }

// What a move saved: the column its record is in now, and what undoes it, when it can be undone; nothing when it stayed put
type Saved = { landed: string | null; undo?: () => Promise<unknown> } | undefined

type Options = {
  model: ResourceModel
  view: ViewModel | undefined
  by: string
  rank?: string | undefined
  /** The board's own writes for a card dropped on another column, in place of saving `by`. */
  drop?: BoardDrop | undefined
  /** The heading of the column of a value. */
  labelOf: (value: string | null) => string
  /** The title a card shows. */
  titleOf: (row: ListDisplayRow) => string
}

/**
 * Moving a board's card to another column: one update of the record with the column's value and the ETag it was listed
 * with, as a named update action sends, so the resource's access rules and `validate` decide. On a ranked board a drop
 * at a place is one batch instead, that update when the column changes and a `reorder` by `rank` of the column's cards.
 * With the board's `drop`, a card dropped on another column runs that column's write instead, and then reads the record
 * again to say which column it is in now. The card shows in its new place at once; a saved move says so with **Undo**,
 * which puts back the values it changed or runs the undo the drop's write gave, and a refusal puts it back and says why.
 * With the position's `after`, a card dropped above a record it depends on lands at the first place below that keeps
 * the order, or stays where it was, with a warning saying why (see `rankedPlace`).
 * Either way every list of the resource reloads, which puts the card where its record now is.
 */
export const useBoardMove = ({ model, view, by, rank, drop, labelOf, titleOf }: Options) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const [moves, setMoves] = useState<BoardMove[]>([])
  // Only the latest move can be undone, so its toast replaces the one before
  const undoToast = useRef<number>(undefined)
  const settle = (key: string) => setMoves((current) => current.filter((move) => move.row.key !== key))
  const fields = rank ? [by, rank] : [by]

  const undo = useMutation({
    mutationFn: (undoing: () => Promise<unknown>) => undoing(),
    onError: (error) => toast.show({ state: 'error', title: text('couldNotUndo'), description: refusalReason(error) }),
    onSettled: () => refresh(model.name),
  })

  // A drop on a column of the board's `drop`: its write, then the record read again for the column it is in now
  const dropped = async (row: ListDisplayRow, to: BoardColumn): Promise<Saved> => {
    const write = drop && dropWrite(drop, to.value)
    if (!write) throw new Error(`The column ${to.label} takes no cards`)
    const key = recordKey(model, row.record) as KeyValue
    const etag = typeof row.record.etag === 'string' ? row.record.etag : '*'
    const undoing = await write({ resource: model.name, record: row.record, recordKey: key, etag, to: to.value!, client })
    const stored = await client.get(model.name, key)
    return { landed: (stored.record[by] ?? null) as string | null, ...(undoing && { undo: undoing }) }
  }

  // The values a move or placing saved, which its undo puts back
  const saved = (writes: DragWrite[], to: BoardColumn): Saved => ({ landed: to.value, undo: () => client.batchWrite(undoOps(model, writes, fields)) })

  // The card shown in its column, in `order` when it has a place there
  const show = (row: ListDisplayRow, to: BoardColumn, order?: ListDisplayRow[]) => {
    const moved = { ...row, record: { ...row.record, [by]: to.value } }
    const keys = order?.map((entry) => entry.key)
    setMoves((current) => [...current.filter((move) => move.row.key !== row.key), { row: moved, to: to.value, ...(keys && { order: keys }) }])
  }

  // Where the card lands by what its record depends on, saying so when that is not where it was dropped
  const allowed = async (row: ListDisplayRow, to: BoardColumn, place: NonNullable<Move['place']>): Promise<RankedPlace | undefined> => {
    if (!model.position?.after) return { index: place.index }
    const bounds = await rankBounds(client, model, view, row.record)
    const ranked = rankedPlace({ model, rank: rank!, rows: place.rows, row, index: place.index, bounds, title: titleOf(row) })
    // Back in its own place it stays as it was, unwritten
    const stays = !ranked.place || (ranked.place.bump === undefined && ranked.place.index === place.rows.findIndex((entry) => entry.key === row.key))
    if (ranked.reason !== undefined) toast.show({ state: 'warning', title: stays ? orderText('notMoved') : orderText('movedToPlace', ranked.place!.index + 1), description: ranked.reason })
    if (stays) return undefined
    if (ranked.place!.index !== place.index) show(row, to, placing(place.rows, row, ranked.place!.index).order)
    return ranked.place
  }

  // A drop at a place: the column's cards renumbered, with the card's update first when it changes column
  const placed = async (row: ListDisplayRow, to: BoardColumn, place: NonNullable<Move['place']>): Promise<Saved> => {
    const landing = await allowed(row, to, place)
    if (!landing) return undefined
    const { order, first, last } = placing(place.rows, row, landing.index)
    return saved(boardWrites(model, order, await client.batchWrite(placeOps(model, by, rank!, row, to, order, first, last, landing.bump))), to)
  }

  const mutation = useMutation({
    mutationFn: async ({ row, to, place }: Move): Promise<Saved> => {
      if (place && !rank) throw new Error('A board places a card only by its rank')
      const from = (row.record[by] ?? null) as string | null
      if (drop && to.value !== from) return dropped(row, to)
      if (place) return placed(row, to, place)
      const etag = typeof row.record.etag === 'string' ? row.record.etag : '*'
      const stored = await client.update(model.name, recordKey(model, row.record) as KeyValue, { [by]: to.value }, etag)
      return saved([{ before: row.record, record: stored.record, etag: stored.etag }], to)
    },
    onMutate: ({ row, to, place }) => show(row, to, place && placing(place.rows, row, place.index).order),
    onSuccess: (result, { row, to }) => {
      if (!result) return
      const { landed, undo: undoing } = result
      if (undoToast.current !== undefined) toast.dismiss(undoToast.current)
      undoToast.current = undefined
      const from = row.record[by] ?? null
      const title = landed !== from ? text('movedTo', labelOf(landed)) : from === to.value ? text('orderChanged') : text('stayedIn', labelOf(landed))
      if (!undoing) {
        toast.show({ state: 'success', title })
        return
      }
      const id = toast.show({
        state: 'success',
        title,
        action: {
          label: text('undo'),
          onClick: () => {
            toast.dismiss(id)
            undoToast.current = undefined
            undo.mutate(undoing)
          },
        },
      })
      undoToast.current = id
    },
    onError: (error, { row, to }) => {
      settle(row.key)
      const title = (row.record[by] ?? null) === to.value ? text('couldNotReorder') : text('couldNotMoveTo', to.label)
      toast.show({ state: 'error', title, description: refusalReason(error) })
    },
    onSettled: async (_result, _error, { row }) => {
      await refresh(model.name)
      settle(row.key)
    },
  })

  return { moves, move: (row: ListDisplayRow, to: BoardColumn, place?: NonNullable<Move['place']>) => mutation.mutate({ row, to, ...(place && { place }) }) }
}
