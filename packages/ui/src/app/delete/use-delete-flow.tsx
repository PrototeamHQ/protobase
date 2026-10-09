import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { PreconditionFailedError, isApiError } from '@protobase/client'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { useToast } from '../../toasts'
import { BulkDeleteDialog, ConfirmDeleteDialog, ConflictDialog, type BulkFailure } from './dialogs'
import { diffRecords, type FieldChange } from './record-diff'

/** A record to delete: `key` is its URL key, `etag` the version the user saw (when known). */
export type DeleteTarget = { key: string; title: string; etag?: string; snapshot: Record<string, unknown> }

type Flow =
  | { kind: 'confirm'; target: DeleteTarget }
  | { kind: 'conflict'; target: DeleteTarget; changes: FieldChange[]; fresh: Record<string, unknown> }
  | { kind: 'bulk-confirm'; targets: DeleteTarget[] }
  | { kind: 'bulk-running'; done: number; total: number }
  | { kind: 'bulk-done'; total: number; failures: BulkFailure[] }

export type DeleteFlowOptions = {
  model: ResourceModel
  view: ViewModel | undefined
  onDeleted?: (target: DeleteTarget) => void
  /** "Review changes" in the conflict dialog; receives the freshly read record. */
  onReview?: (target: DeleteTarget, fresh: Record<string, unknown>) => void
  /** Brings a soft-deleted record back. Without it, deleting a soft-delete resource offers no Undo. */
  restore?: (target: DeleteTarget) => Promise<void>
}

const concurrency = 4

/**
 * Delete with `If-Match`: hard deletes ask first, soft deletes go straight through (with Undo when `restore` exists),
 * a 412 opens a dialog that says what changed, and bulk deletes confirm once and report each failure.
 */
export const useDeleteFlow = ({ model, view, onDeleted, onReview, restore }: DeleteFlowOptions) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [flow, setFlow] = useState<Flow>()
  const [busy, setBusy] = useState(false)
  const noun = view?.names?.singular ?? humanize(model.name)
  const plural = view?.names?.plural ?? humanize(model.name)

  const refresh = () => {
    for (const prefix of ['page', 'list', 'first-page']) void queryClient.invalidateQueries({ queryKey: [prefix, model.name] })
    for (const prefix of ['facets', 'series', 'histogram']) void queryClient.invalidateQueries({ queryKey: [prefix, model.name] })
  }

  /** Deletes with the given ETag (`*` for any version). Returns false after opening the conflict dialog on a 412. */
  const remove = async (target: DeleteTarget, etag: string | undefined) => {
    const version = etag ?? (await client.get(model.name, target.key)).etag
    try {
      await client.remove(model.name, target.key, { etag: version })
    } catch (error) {
      if (!(error instanceof PreconditionFailedError)) throw error
      return error
    }
    return undefined
  }

  const succeeded = (target: DeleteTarget) => {
    refresh()
    setFlow(undefined)
    onDeleted?.(target)
    toast.show({
      state: 'success',
      title: `${target.title} deleted`,
      ...(model.softDelete && restore && {
        action: {
          label: 'Undo',
          onClick: () => {
            void restore(target).then(
              () => {
                refresh()
                toast.show({ state: 'success', title: `${target.title} restored` })
              },
              (error: unknown) => {
                if (!isApiError(error)) throw error
                refresh()
                toast.show({ state: error.status === 409 ? 'success' : 'error', title: error.status === 409 ? `${target.title} is already back` : `Could not restore ${target.title}`, description: error.status === 409 ? undefined : error.message })
              },
            )
          },
        },
      }),
    })
  }

  const attempt = async (target: DeleteTarget, etag: string | undefined) => {
    setBusy(true)
    try {
      const stale = await remove(target, etag)
      if (!stale) return succeeded(target)
      const fresh = (await client.get(model.name, target.key)).record
      setFlow({ kind: 'conflict', target, fresh, changes: diffRecords(model, view, target.snapshot, fresh) })
    } catch (error) {
      if (!isApiError(error)) throw error
      setFlow(undefined)
      toast.show({ state: 'error', title: `Could not delete ${target.title}`, description: error.message })
    } finally {
      setBusy(false)
    }
  }

  const deleteQuietly = async (target: DeleteTarget): Promise<BulkFailure | undefined> => {
    try {
      const stale = await remove(target, target.etag)
      return stale ? { title: target.title, message: 'Changed since the list loaded, so it was kept.' } : undefined
    } catch (error) {
      if (!isApiError(error)) throw error
      return { title: target.title, message: error.message }
    }
  }

  const runBulk = async (targets: DeleteTarget[]) => {
    const failures: BulkFailure[] = []
    let done = 0
    setFlow({ kind: 'bulk-running', done, total: targets.length })
    const queue = [...targets]
    const worker = async () => {
      for (let target = queue.shift(); target; target = queue.shift()) {
        const failure = await deleteQuietly(target)
        if (failure) failures.push(failure)
        done += 1
        setFlow({ kind: 'bulk-running', done, total: targets.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker))
    refresh()
    setFlow({ kind: 'bulk-done', total: targets.length, failures })
  }

  const close = () => setFlow(undefined)

  const dialogs: ReactNode = flow && (
    <>
      {flow.kind === 'confirm' && <ConfirmDeleteDialog title={flow.target.title} noun={noun} busy={busy} onCancel={close} onConfirm={() => void attempt(flow.target, flow.target.etag)} />}
      {flow.kind === 'conflict' && (
        <ConflictDialog
          title={flow.target.title}
          changes={flow.changes}
          busy={busy}
          onCancel={close}
          onReview={() => {
            close()
            onReview?.(flow.target, flow.fresh)
          }}
          onDeleteAnyway={() => void attempt(flow.target, '*')}
        />
      )}
      {flow.kind === 'bulk-confirm' && <BulkDeleteDialog stage="confirm" count={flow.targets.length} plural={plural} onCancel={close} onConfirm={() => void runBulk(flow.targets)} />}
      {flow.kind === 'bulk-running' && <BulkDeleteDialog stage="running" done={flow.done} total={flow.total} />}
      {flow.kind === 'bulk-done' && <BulkDeleteDialog stage="done" total={flow.total} failures={flow.failures} onClose={close} />}
    </>
  )

  return {
    dialogs,
    /** Soft-delete resources go straight through; others ask first. */
    start: (target: DeleteTarget) => (model.softDelete ? attempt(target, target.etag) : setFlow({ kind: 'confirm', target })),
    startBulk: (targets: DeleteTarget[]) => setFlow({ kind: 'bulk-confirm', targets }),
  }
}
