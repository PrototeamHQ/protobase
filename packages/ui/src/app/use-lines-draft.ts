import { useCallback, useMemo, useState } from 'react'
import type { BatchOp } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema'
import { recordKey } from '../live/model-helpers'

type Line = Record<string, unknown>

/**
 * The order the person has given the lines of a record, kept in the form until Save writes it, together with the
 * record, in one batch. `shown` is the lines in that order; `op()` is the batch operation that makes it permanent.
 */
export const useLinesDraft = (model: ResourceModel | undefined, stored: Line[]) => {
  const [order, setOrder] = useState<string[]>()
  const ids = stored.map((line) => String(line.id))

  const shown = useMemo(() => {
    if (!order) return stored
    const known = order.flatMap((id) => stored.filter((line) => String(line.id) === id))
    const added = stored.filter((line) => !order.includes(String(line.id)))
    return [...known, ...added]
  }, [order, stored])

  const shownIds = shown.map((line) => String(line.id))
  const dirty = order !== undefined && shownIds.some((id, index) => id !== ids[index])

  const op = useCallback((): BatchOp[] => {
    if (!model || !dirty) return []
    return [
      {
        op: 'reorder',
        resource: model.name,
        field: 'position',
        keys: shown.map((line) => recordKey(model, line)),
        etags: Object.fromEntries(shown.flatMap((line) => (typeof line.etag === 'string' ? [[encodeKey(recordKey(model, line)), line.etag]] : []))),
      },
    ]
  }, [model, dirty, shown])

  return {
    shown,
    dirty,
    /** The ids in the order on screen, for keeping a draft. */
    order: dirty ? shownIds : undefined,
    setOrder: (next: string[]) => setOrder(next),
    reset: () => setOrder(undefined),
    op,
  }
}

export type LinesDraft = ReturnType<typeof useLinesDraft>
