import { useState } from 'react'
import { ArrowUpCircle } from 'lucide-react'
import type { RuntimeClient } from '@protobase/client'
import { Button } from '../../primitives/button'
import { Dialog } from '../../primitives/dialog'
import { nextUpdateText, showsUpdateButton, updateErrorText } from './runtime-status'
import { useRuntimeClient, useRuntimeStatus } from './use-runtime-status'

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-4 py-1 text-[13px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium tabular-nums">{value}</span>
  </div>
)

/**
 * The top bar's runtime update button, shown while the endpoint reports an update and wants it shown, and the dialog
 * it opens: the versions, when the update policy applies the latest one, and "Update now". Below `md` only the icon shows.
 */
const RuntimeUpdate = ({ client }: { client: RuntimeClient | undefined }) => {
  const { status, update, requesting, error, checkError } = useRuntimeStatus(client)
  const [open, setOpen] = useState(false)
  if (!status || (!open && !showsUpdateButton(status))) return null

  return (
    <>
      <Button size="sm" variant="ghost" aria-label="Update available" title="Update available" onClick={() => setOpen(true)} className="max-md:size-9 max-md:p-0">
        <ArrowUpCircle className="size-3.5 text-primary" />
        <span className="max-md:sr-only">Update</span>
      </Button>
      {open && (
        <Dialog
          title="Runtime update"
          description={nextUpdateText(status)}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button onClick={() => setOpen(false)}>Close</Button>
              <Button variant="primary" loading={requesting} disabled={status.updating || !status.updateAvailable} onClick={() => void update()}>
                {status.updating ? 'Updating…' : 'Update now'}
              </Button>
            </>
          }
        >
          <Row label="Current version" value={status.version} />
          <Row label="Latest version" value={status.latest} />
          {error !== undefined && <p role="alert" className="mt-3 text-[13px] text-danger-text">{updateErrorText(error)}</p>}
          {checkError !== undefined && <p className="mt-3 text-[13px] text-muted-foreground">The status could not be checked again; this is the last one read.</p>}
        </Dialog>
      )}
    </>
  )
}

const OwnRuntimeUpdate = ({ url }: { url: string }) => <RuntimeUpdate client={useRuntimeClient(url)} />

/** The update button for the endpoint `/meta` names, signed in as the user; `client` replaces it in stories and tests. */
export const RuntimeUpdateButton = ({ url, client }: { url: string; client?: RuntimeClient }) => (client ? <RuntimeUpdate client={client} /> : <OwnRuntimeUpdate url={url} />)
