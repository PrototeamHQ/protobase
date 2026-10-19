import type { RuntimeStatus } from '@protobase/client'
import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'
import { Spinner } from '../../primitives/spinner'
import { lastUpdateText, nextUpdateText, updateErrorText } from './runtime-status'
import { text } from './messages'

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 py-1">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{value}</span>
  </div>
)

export type RuntimeUpdateDialogProps = {
  status: RuntimeStatus
  requesting: boolean
  /** Why "Update now" failed. */
  error: unknown
  /** Why the last read of the status failed. */
  checkError: unknown
  onUpdate: () => void
  onClose: () => void
}

/**
 * The runtime update dialog: the versions, how far a running update is or when the policy applies the latest one, how
 * the last update ended (while none runs), and "Update now".
 */
export const RuntimeUpdateDialog = ({ status, requesting, error, checkError, onUpdate, onClose }: RuntimeUpdateDialogProps) => {
  const last = status.updating ? undefined : status.lastUpdate
  return (
    <Dialog
      title={text('runtimeUpdate')}
      description={
        status.updating ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="size-3.5" />
            {nextUpdateText(status)}
          </span>
        ) : (
          nextUpdateText(status)
        )
      }
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{text('close')}</Button>
          <Button variant="primary" loading={requesting} disabled={status.updating || !status.updateAvailable} onClick={onUpdate}>
            {status.updating ? text('updating') : text('updateNow')}
          </Button>
        </>
      }
    >
      <Row label={text('currentVersion')} value={status.version} />
      <Row label={text('latestVersion')} value={status.latest} />
      {last && <p className={last.outcome === 'failed' ? 'mt-3 text-danger-text' : 'mt-3 text-muted-foreground'}>{lastUpdateText(last)}</p>}
      {error !== undefined && <p role="alert" className="mt-3 text-danger-text">{updateErrorText(error)}</p>}
      {checkError !== undefined && <p className="mt-3 text-muted-foreground">{text('checkFailed')}</p>}
    </Dialog>
  )
}
