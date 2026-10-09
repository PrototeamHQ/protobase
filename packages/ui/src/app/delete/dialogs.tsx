import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'
import type { FieldChange } from './record-diff'

export const ConfirmDeleteDialog = ({ title, noun, busy, onConfirm, onCancel }: { title: string; noun: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) => (
  <Dialog
    title={`Delete ${title}?`}
    description={`This ${noun.toLowerCase()} will be removed. This cannot be undone.`}
    onClose={onCancel}
    actions={
      <>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" className="bg-danger hover:bg-danger/90" loading={busy} onClick={onConfirm}>
          Delete
        </Button>
      </>
    }
  />
)

export const ConflictDialog = ({ title, changes, busy, onReview, onDeleteAnyway, onCancel }: { title: string; changes: FieldChange[]; busy?: boolean; onReview: () => void; onDeleteAnyway: () => void; onCancel: () => void }) => (
  <Dialog
    title={`${title} was changed since you opened it`}
    description="Someone saved this record in the meantime. Review what changed before you delete it."
    onClose={onCancel}
    actions={
      <>
        <Button onClick={onReview}>Review changes</Button>
        <Button variant="primary" className="bg-danger hover:bg-danger/90" loading={busy} onClick={onDeleteAnyway}>
          Delete anyway
        </Button>
      </>
    }
  >
    {changes.length === 0 ? (
      <p className="text-[13px] text-muted-foreground">No visible fields differ; the record was saved again with the same values.</p>
    ) : (
      <ul className="divide-y rounded-md border text-[13px]">
        {changes.map((change) => (
          <li key={change.field} className="grid grid-cols-[96px_1fr] gap-3 px-3 py-2">
            <span className="text-muted-foreground">{change.label}</span>
            <span>
              <span className="text-muted-foreground line-through">{change.before}</span> <span className="font-medium">{change.after}</span>
            </span>
          </li>
        ))}
      </ul>
    )}
  </Dialog>
)

export type BulkFailure = { title: string; message: string }

export const BulkDeleteDialog = (
  props:
    | { stage: 'confirm'; count: number; plural: string; onConfirm: () => void; onCancel: () => void }
    | { stage: 'running'; done: number; total: number }
    | { stage: 'done'; total: number; failures: BulkFailure[]; onClose: () => void },
) => {
  if (props.stage === 'confirm') {
    return (
      <Dialog
        title={`Delete ${props.count} ${props.count === 1 ? props.plural.replace(/s$/, '') : props.plural.toLowerCase()}?`}
        description="This cannot be undone. Each record is deleted only if it has not changed since the list loaded; anything that changed is reported and kept."
        onClose={props.onCancel}
        actions={
          <>
            <Button onClick={props.onCancel}>Cancel</Button>
            <Button variant="primary" className="bg-danger hover:bg-danger/90" onClick={props.onConfirm}>
              Delete {props.count}
            </Button>
          </>
        }
      />
    )
  }
  if (props.stage === 'running') return <Dialog title="Deleting" description={`${props.done} of ${props.total} done`} onClose={() => undefined} actions={<Button loading disabled>Working</Button>} />
  const deleted = props.total - props.failures.length
  return (
    <Dialog
      title={props.failures.length === 0 ? `Deleted ${deleted}` : `Deleted ${deleted} of ${props.total}`}
      description={props.failures.length === 0 ? undefined : `${props.failures.length} could not be deleted and were kept.`}
      onClose={props.onClose}
      actions={<Button variant="primary" onClick={props.onClose}>Done</Button>}
    >
      {props.failures.length > 0 && (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-[13px]">
          {props.failures.map((failure) => (
            <li key={failure.title} className="px-3 py-2">
              <span className="font-medium">{failure.title}</span>
              <span className="block text-xs text-danger-text">{failure.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
