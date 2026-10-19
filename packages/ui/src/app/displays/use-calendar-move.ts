import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { KeyValue, ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { formatDate } from '../../format/date'
import { recordKey } from '../../live/model-helpers'
import { useToast } from '../../toasts'
import { useRefreshResource } from '../pages/use-layout-data'
import { refusalReason } from './board-columns'
import { movedPatch, type DatedDisplay } from './calendar-range'
import type { ListDisplayRow } from './list-displays'

/** An event on its way to another day: the fields the update sets, shown until the calendar has reloaded. */
export type CalendarMove = { key: string; patch: Record<string, string> }

/** The rows with each moving record's new dates, so an event shows on its new day at once. */
export const movedRows = (rows: ListDisplayRow[], moves: CalendarMove[]) => {
  const patches = new Map(moves.map((move) => [move.key, move.patch]))
  return rows.map((row) => (patches.has(row.key) ? { ...row, record: { ...row.record, ...patches.get(row.key) } } : row))
}

/**
 * Moving a calendar's event to another day: one update of the record with its `start` and `end` moved by the same days
 * and the ETag it was listed with, as a named update action sends, so the resource's access rules and `validate`
 * decide. The event shows on its new day at once; a refusal puts it back and says why, and either way every list of
 * the resource reloads.
 */
export const useCalendarMove = (model: ResourceModel, display: DatedDisplay) => {
  const client = useClient()
  const toast = useToast()
  const refresh = useRefreshResource()
  const [moves, setMoves] = useState<CalendarMove[]>([])
  const settle = (key: string) => setMoves((current) => current.filter((move) => move.key !== key))

  const mutation = useMutation({
    mutationFn: ({ row, patch }: { row: ListDisplayRow; patch: Record<string, string>; to: string }) => {
      const etag = typeof row.record.etag === 'string' ? row.record.etag : '*'
      return client.update(model.name, recordKey(model, row.record) as KeyValue, patch, etag)
    },
    onMutate: ({ row, patch }) => setMoves((current) => [...current.filter((move) => move.key !== row.key), { key: row.key, patch }]),
    onError: (error, { row, to }) => {
      settle(row.key)
      toast.show({ state: 'error', title: `Could not move it to ${formatDate(Date.parse(`${to}T00:00:00Z`))}`, description: refusalReason(error) })
    },
    onSettled: async (_result, _error, { row }) => {
      await refresh(model.name)
      settle(row.key)
    },
  })

  /** Moves the record of `row`, shown on the day `from`, to the day `to`. */
  const move = (row: ListDisplayRow, from: string, to: string) => mutation.mutate({ row, patch: movedPatch(row.record, display, model, from, to), to })
  return { moves, move }
}
