import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'
import type { FieldChange } from './record-diff'
import { text } from './messages'

export const ConfirmDeleteDialog = ({ title, noun, busy, onConfirm, onCancel }: { title: string; noun: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) => (
  <Dialog
    title={text('confirmTitle', { title })}
    description={text('confirmDescription', { noun, title })}
    onClose={onCancel}
    actions={
      <>
        <Button onClick={onCancel}>{text('cancel')}</Button>
        <Button variant="primary" className="bg-danger hover:bg-danger/90" loading={busy} onClick={onConfirm}>
          {text('delete')}
        </Button>
      </>
    }
  />
)

export const ConflictDialog = ({ title, changes, busy, onReview, onDeleteAnyway, onCancel }: { title: string; changes: FieldChange[]; busy?: boolean; onReview: () => void; onDeleteAnyway: () => void; onCancel: () => void }) => (
  <Dialog
    title={text('changedTitle', { title })}
    description={text('changedDescription')}
    onClose={onCancel}
    actions={
      <>
        <Button onClick={onReview}>{text('reviewChanges')}</Button>
        <Button variant="primary" className="bg-danger hover:bg-danger/90" loading={busy} onClick={onDeleteAnyway}>
          {text('deleteAnyway')}
        </Button>
      </>
    }
  >
    {changes.length === 0 ? (
      <p className="text-muted-foreground">{text('noVisibleChanges')}</p>
    ) : (
      <ul className="divide-y rounded-md border">
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
    | { stage: 'confirm'; count: number; noun: string; plural: string; onConfirm: () => void; onCancel: () => void }
    | { stage: 'running'; done: number; total: number }
    | { stage: 'done'; total: number; failures: BulkFailure[]; onClose: () => void },
) => {
  if (props.stage === 'confirm') {
    return (
      <Dialog
        title={text('bulkConfirmTitle', { count: props.count, noun: props.noun, plural: props.plural })}
        description={text('bulkConfirmDescription')}
        onClose={props.onCancel}
        actions={
          <>
            <Button onClick={props.onCancel}>{text('cancel')}</Button>
            <Button variant="primary" className="bg-danger hover:bg-danger/90" onClick={props.onConfirm}>
              {text('deleteCount', { count: props.count })}
            </Button>
          </>
        }
      />
    )
  }
  if (props.stage === 'running') return <Dialog title={text('deleting')} description={text('progress', { done: props.done, total: props.total })} onClose={() => undefined} actions={<Button loading disabled>{text('working')}</Button>} />
  const deleted = props.total - props.failures.length
  return (
    <Dialog
      title={props.failures.length === 0 ? text('deleted', { count: deleted }) : text('deletedOf', { count: deleted, total: props.total })}
      description={props.failures.length === 0 ? undefined : text('kept', { count: props.failures.length })}
      onClose={props.onClose}
      actions={<Button variant="primary" onClick={props.onClose}>{text('done')}</Button>}
    >
      {props.failures.length > 0 && (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
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
