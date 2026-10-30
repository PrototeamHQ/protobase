import { useMemo, useRef, useState } from 'react'
import type { ApiError, ProblemError } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { toFieldDraft } from '../live/field-values'
import { recordId } from '../live/model-helpers'
import { fieldErrors } from './field-errors'
import { emptyLinesState, planLinesOps, shownIds, type LinesPlan, type LinesState } from './lines-plan'

type Line = Record<string, unknown>

/** Where the lines are written: their resource, the field that orders them, and the relation to the record with its key. */
export type LinesTarget = { model: ResourceModel; position: string; link: { field: string; value: unknown } }

/** A line on screen: a stored one, with what was typed over it, or a new one, which has no `stored`. */
export type ShownLine = { id: string; stored?: Line }

/** What the server said about a line on the last save: per field, and its message for the line as a whole. */
export type LineRejection = { id: string; fields: Record<string, ProblemError>; message: string }

const without = <V>(source: Record<string, V>, name: string): Record<string, V> => Object.fromEntries(Object.entries(source).filter(([key]) => key !== name))

/**
 * The changes the person made to a record's lines, kept in the form until Save writes them, together with the record,
 * in one batch: the order, new lines, typed fields and removed lines. `shown` is the lines as they are on screen;
 * `plan()` is the batch that makes them permanent.
 */
export const useLinesDraft = (target: LinesTarget | undefined, stored: Line[]) => {
  const [state, setState] = useState<LinesState>(emptyLinesState)
  const [rejection, setRejection] = useState<LineRejection>()
  const nextId = useRef(1)
  const byId = useMemo(() => new Map(target ? stored.map((line) => [recordId(target.model, line), line]) : []), [target, stored])
  const shown: ShownLine[] = shownIds([...byId.keys()], state).map((id) => ({ id, stored: byId.get(id) }))

  const plan = (): LinesPlan => (target ? planLinesOps({ ...target, stored, state }) : { ops: [], rows: [] })
  const dirty = plan().ops.length > 0
  // The same array while the order stays, so a draft is kept only when it changes
  const order = useMemo(() => {
    const kept = shownIds([...byId.keys()], state).filter((id) => byId.has(id))
    const before = [...byId.keys()].filter((id) => kept.includes(id))
    return state.order !== undefined && kept.some((id, index) => id !== before[index]) ? kept : undefined
  }, [byId, state])

  /** The value a line's field editor holds: what was typed, else the stored value as the editor takes it. */
  const value = (id: string, name: string) => {
    const typed = state.edits[id]
    if (typed && name in typed) return typed[name]
    const field = target?.model.fields[name]
    const current = byId.get(id)?.[name]
    if (!field) return current
    return ['boolean', 'file'].includes(field.type) ? current : toFieldDraft(field, current)
  }

  const forget = (id: string) => setRejection((current) => (current?.id === id ? undefined : current))

  return {
    shown,
    dirty,
    /** The stored lines' ids in the order on screen, once moved, for keeping a draft. */
    order,
    value,
    change: (id: string, name: string, next: unknown) => {
      forget(id)
      setState((current) => ({ ...current, edits: { ...current.edits, [id]: { ...current.edits[id], [name]: next } } }))
    },
    /** Adds an empty line at the end; the database's defaults fill what is left empty when it is saved. */
    add: () => {
      const id = `new:${nextId.current++}`
      setState((current) => ({ ...current, added: [...current.added, id] }))
      return id
    },
    remove: (id: string) => {
      forget(id)
      setState((current) =>
        current.added.includes(id) ? { ...current, added: current.added.filter((each) => each !== id), edits: without(current.edits, id) } : { ...current, removed: [...current.removed, id] },
      )
    },
    setOrder: (next: string[]) => setState((current) => ({ ...current, order: next })),
    reset: () => {
      setState(emptyLinesState)
      setRejection(undefined)
    },
    /** The server turned down the write of line `id`: its fields and message show on that line until it changes. */
    reject: (id: string, error: ApiError) => setRejection({ id, fields: fieldErrors(error), message: error.message }),
    rejection,
    plan,
  }
}

export type LinesDraft = ReturnType<typeof useLinesDraft>
