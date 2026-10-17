import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { KeyValue, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { recordKey } from '../../live/model-helpers'
import { useToast } from '../../toasts'
import { useRefreshResource } from '../pages/use-layout-data'
import { refusalReason, type BoardColumn } from './board-columns'
import type { ListDisplayRow } from './list-displays'

/** A card on its way to another column: the record as it will be, shown there until the columns have reloaded. */
export type BoardMove = { row: ListDisplayRow; to: string | null }

/**
 * Moving a board's card to another column: one update of the record with the column's value and the ETag it was listed
 * with, as a named update action sends, so the resource's access rules and `validate` decide. The card shows in its new
 * column at once; a refusal puts it back and says why, and either way every list of the resource reloads.
 */
export const useBoardMove = (model: ResourceModel, by: string) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const [moves, setMoves] = useState<BoardMove[]>([])
  const settle = (key: string) => setMoves((current) => current.filter((move) => move.row.key !== key))

  const mutation = useMutation({
    mutationFn: ({ row, to }: { row: ListDisplayRow; to: BoardColumn }) => {
      const etag = typeof row.record.etag === 'string' ? row.record.etag : '*'
      return client.update(model.name, recordKey(model, row.record) as KeyValue, { [by]: to.value }, etag)
    },
    onMutate: ({ row, to }) => {
      const moved = { ...row, record: { ...row.record, [by]: to.value } }
      setMoves((current) => [...current.filter((move) => move.row.key !== row.key), { row: moved, to: to.value }])
    },
    onError: (error, { row, to }) => {
      settle(row.key)
      toast.show({ state: 'error', title: `Could not move it to ${to.label}`, description: refusalReason(error) })
    },
    onSettled: async (_result, _error, { row }) => {
      await refresh(model.name)
      settle(row.key)
    },
  })

  return { moves, move: (row: ListDisplayRow, to: BoardColumn) => mutation.mutate({ row, to }) }
}
