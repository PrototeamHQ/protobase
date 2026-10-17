import { useState } from 'react'
import { ArrowUpCircle } from 'lucide-react'
import type { RuntimeClient } from '@protobase/client'
import { Button } from '../../primitives/button'
import { showsUpdateButton } from './runtime-status'
import { RuntimeUpdateDialog } from './runtime-update-dialog'
import { useRuntimeClient, useRuntimeStatus } from './use-runtime-status'

/**
 * The top bar's runtime update button, shown while the endpoint reports an update and wants it shown, and the dialog
 * it opens. On mobile only the icon shows.
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
      {open && <RuntimeUpdateDialog status={status} requesting={requesting} error={error} checkError={checkError} onUpdate={() => void update()} onClose={() => setOpen(false)} />}
    </>
  )
}

const OwnRuntimeUpdate = ({ url }: { url: string }) => <RuntimeUpdate client={useRuntimeClient(url)} />

/** The update button for the endpoint `/meta` names, signed in as the user; `client` replaces it in stories and tests. */
export const RuntimeUpdateButton = ({ url, client }: { url: string; client?: RuntimeClient }) => (client ? <RuntimeUpdate client={client} /> : <OwnRuntimeUpdate url={url} />)
