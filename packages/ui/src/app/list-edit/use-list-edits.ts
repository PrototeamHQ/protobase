import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { isApiError } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import type { GridRow } from '../../data-grid'
import { recordKey } from '../../live/model-helpers'
import { useToast } from '../../toasts'

type Patches = ReadonlyMap<string, Partial<GridRow>>

/**
 * The list's edits in place: `patches` holds, by row id, the values saving or saved since the rows loaded, with the
 * ETag each saved row has now. `save` sends one field as a PATCH with the row's ETag, after any save of the same row
 * still under way. A refusal puts the old value back, or the record's current one when someone else changed it, and
 * says why in a toast.
 */
export const useListEdits = (model: ResourceModel) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [patches, setPatches] = useState<Patches>(new Map())
  const current = useRef<Patches>(patches)
  const queues = useRef(new Map<string, Promise<void>>())

  const patch = (id: string, values: Partial<GridRow>) => {
    current.current = new Map(current.current).set(id, { ...current.current.get(id), ...values })
    setPatches(current.current)
  }

  const send = async (row: GridRow, name: string, value: unknown) => {
    const key = recordKey(model, row)
    const etag = String(current.current.get(row.id)?.etag ?? row.etag)
    try {
      const stored = await client.update(model.name, key, { [name]: value }, etag)
      patch(row.id, { [name]: stored.record[name], etag: stored.etag })
      queryClient.setQueryData(keys.record(model.name, encodeKey(key)), stored)
      void queryClient.invalidateQueries({ queryKey: ['page', model.name] })
      void queryClient.invalidateQueries({ queryKey: ['list', model.name] })
      void queryClient.invalidateQueries({ queryKey: ['map', model.name] })
    } catch (error) {
      if (!isApiError(error)) {
        patch(row.id, { [name]: row[name] })
        throw error
      }
      const changed = error.status === 412
      const latest = changed ? await client.get(model.name, key) : undefined
      patch(row.id, latest ? { [name]: latest.record[name], etag: latest.etag } : { [name]: row[name] })
      const reason = error.errors.find((entry) => entry.field === name)?.message ?? error.message
      toast.show({ state: 'error', title: changed ? 'Changed by someone else' : 'Could not save', description: reason })
    }
  }

  /** Saves `value` as the field `name` of `row`, as the grid shows it before the edit. */
  const save = (row: GridRow, name: string, value: unknown) => {
    patch(row.id, { [name]: value })
    const queued = (queues.current.get(row.id) ?? Promise.resolve()).then(() => send(row, name, value))
    queues.current.set(row.id, queued.catch(() => undefined))
    return queued
  }

  return { patches, save }
}
