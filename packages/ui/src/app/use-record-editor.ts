import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { isApiError, type BatchOp, type ProblemError } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import type { LiveRecord } from '../data/use-record'
import { isConflict, useUpdateRecord } from '../data/use-update-record'
import { displayValue } from '../live/display-value'
import { differs, toDraft, toPatchValue } from '../live/field-values'
import { nameFailingOperation } from './batch-failure'
import { fieldErrors } from './field-errors'
import { readDraft, writeDraft } from './draft-storage'
import type { LinesDraft } from './use-lines-draft'
import { useLiveSave, type SaveMode } from './use-live-save'

export type RecordEditorParams = {
  model: ResourceModel
  stored: LiveRecord
  recordKey: string
  mode: SaveMode
  subject: string
  /** Where unsaved changes are kept in local storage, so a reload or a stray click does not lose them. */
  draftKey?: string
  /** The order of the record's lines, written together with the record on Save. */
  lines?: LinesDraft
}

const without = <V>(source: Record<string, V>, name: string): Record<string, V> => Object.fromEntries(Object.entries(source).filter(([key]) => key !== name))

/**
 * Draft state for one record. Saving sends only the changed fields with the ETag that was read;
 * a 412 refetches the record and marks the fields both sides changed so the user can pick a side.
 * When the lines were reordered too, Save sends the record and the new order as one batch: all or nothing.
 */
export const useRecordEditor = ({ model, stored, recordKey, mode, subject, draftKey, lines }: RecordEditorParams) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const update = useUpdateRecord(model.name, recordKey)
  const feedback = useLiveSave(mode, subject)
  const [restored] = useState(() => (draftKey ? readDraft(localStorage, draftKey, stored.etag) : undefined))
  const [draft, setDraft] = useState<Record<string, unknown>>(restored?.fields ?? {})
  const [showRestored, setShowRestored] = useState(Boolean(restored))
  const [linesConflict, setLinesConflict] = useState(false)
  const [conflicts, setConflicts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, ProblemError>>({})
  // How many saves the server turned down for their fields
  const [rejections, setRejections] = useState(0)

  // A draft is kept as typed, so a line break or space at its end stays while the rest is still to come; it is a change
  // only when it stands for another value than the stored one.
  const changed = Object.entries(draft).filter(([name, entry]) => differs(model.fields[name]!, entry, stored.record[name]))
  const fieldsDirty = changed.length > 0
  const dirty = fieldsDirty || Boolean(lines?.dirty)

  // The restored order is applied once, when the record opens.
  useEffect(() => {
    if (restored?.order) lines?.setOrder(restored.order)
  }, [])

  // A sensitive value is never kept in local storage
  useEffect(() => {
    if (!draftKey) return
    const kept = Object.fromEntries(Object.entries(draft).filter(([name]) => !model.fields[name]?.sensitive))
    const keep = Object.keys(kept).length > 0 || Boolean(lines?.dirty)
    writeDraft(localStorage, draftKey, keep ? { etag: stored.etag, fields: kept, ...(lines?.order && { order: lines.order }) } : undefined)
  }, [draftKey, model, draft, lines?.dirty, lines?.order, stored.etag])

  // Booleans and files are edited as they are stored; everything else as text
  const value = (name: string) => (name in draft ? draft[name] : ['boolean', 'file'].includes(model.fields[name]!.type) ? stored.record[name] : toDraft(stored.record[name]))

  const change = (name: string, next: unknown) => {
    setErrors((current) => without(current, name))
    const typed = typeof next === 'string' ? next !== toDraft(stored.record[name]) : differs(model.fields[name]!, next, stored.record[name])
    setDraft((current) => (typed ? { ...current, [name]: next } : without(current, name)))
  }

  const adoptLatest = async () => {
    const latest = await client.get(model.name, recordKey)
    queryClient.setQueryData(keys.record(model.name, recordKey), latest)
    const theirs: Record<string, string> = {}
    const keep: Record<string, unknown> = {}
    for (const [name, mine] of Object.entries(draft)) {
      const field = model.fields[name]!
      if (!differs(field, mine, latest.record[name])) continue
      keep[name] = mine
      if (toDraft(latest.record[name]) !== toDraft(stored.record[name])) theirs[name] = field.type === 'file' ? displayValue(field, latest.record[name]) : toDraft(latest.record[name])
    }
    setDraft(keep)
    setConflicts(theirs)
  }

  const patchOf = () => Object.fromEntries(changed.map(([name, entry]) => [name, toPatchValue(model.fields[name]!, entry)]))

  const reject = (error: unknown) => {
    const found = fieldErrors(error)
    setErrors(found)
    if (Object.keys(found).length > 0) setRejections((count) => count + 1)
  }

  const saveRecordOnly = async () => {
    try {
      await update.mutateAsync({ patch: patchOf(), etag: stored.etag })
    } catch (error) {
      if (isConflict(error)) await adoptLatest()
      else if (isApiError(error)) reject(error)
      throw error
    }
  }

  const saveBatch = async (linesOps: BatchOp[]) => {
    const ops: BatchOp[] = [...(fieldsDirty ? [{ op: 'update' as const, resource: model.name, key: recordKey, data: patchOf(), etag: stored.etag }] : []), ...linesOps]
    try {
      await client.batchWrite(ops)
    } catch (error) {
      if (isConflict(error)) {
        await adoptLatest()
        await queryClient.invalidateQueries({ queryKey: ['list'] })
        setLinesConflict(true)
      } else if (isApiError(error)) reject(error)
      throw isApiError(error) ? nameFailingOperation(error, ops) : error
    }
    await Promise.all([queryClient.invalidateQueries({ queryKey: keys.record(model.name, recordKey) }), queryClient.invalidateQueries({ queryKey: ['list'] }), queryClient.invalidateQueries({ queryKey: ['page'] }), queryClient.invalidateQueries({ queryKey: ['map'] })])
    lines?.reset()
  }

  const save = () =>
    feedback.run(async () => {
      const linesOps = lines?.op() ?? []
      if (linesOps.length > 0) await saveBatch(linesOps)
      else await saveRecordOnly()
      setDraft({})
      setConflicts({})
      setErrors({})
      setLinesConflict(false)
      setShowRestored(false)
    })

  const discard = () => {
    setDraft({})
    setConflicts({})
    setErrors({})
    setLinesConflict(false)
    setShowRestored(false)
    lines?.reset()
  }

  return {
    value,
    change,
    save,
    dirty,
    discard,
    /** The changes on screen were brought back from this browser. */
    restored: showRestored && dirty,
    dismissRestored: () => setShowRestored(false),
    /** Someone changed the lines while the new order was being made. */
    linesConflict,
    saving: feedback.phase === 'saving',
    phase: feedback.phase,
    message: feedback.message,
    conflicts,
    /** The server's problem with each field, from the last save. */
    errors,
    rejections,
    keepMine: (name: string) => setConflicts((current) => without(current, name)),
    useTheirs: (name: string) => {
      setConflicts((current) => without(current, name))
      setDraft((current) => without(current, name))
    },
  }
}
