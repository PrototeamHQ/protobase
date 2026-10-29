import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { heldStatus, type StatusInput } from '@protobase/schema/internal'
import type { ProfileStatus } from '../app-shell/profile-menu'
import { useClient } from '../data/api-provider'
import { text } from './messages'
import { StatusDialog } from './status-dialog'
import { AvailabilityMark, availabilityLabel, StatusMark } from './status-mark'
import { useOwnStatus } from './use-statuses'

/**
 * The person's own status in the user menu, in an app with `status: {}`, for someone signed in as themselves: the
 * menu's mark and item, and the picker the item opens. Nothing for staff signed in as them, or in an app without it.
 */
export const useStatusMenu = (own: boolean): { menu?: ProfileStatus; dialog?: ReactNode } => {
  const client = useClient()
  const queryClient = useQueryClient()
  const status = useOwnStatus()
  const [open, setOpen] = useState(false)
  if (!own || !status.isSuccess) return {}
  const held = heldStatus(status.data)
  // Everyone's statuses, the person's own among them, are read again at once.
  const done = () => queryClient.invalidateQueries({ queryKey: ['statuses'] })
  const save = async (input: StatusInput) => {
    await client.status.set(input)
    await done()
  }
  const clear = async () => {
    await client.status.clear()
    await done()
  }
  return {
    menu: {
      mark: held && <StatusMark status={held} textShown="hover" />,
      label: held ? (
        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
          <AvailabilityMark availability={held.availability} />
          <span className="truncate">{held.text ?? availabilityLabel(held.availability)}</span>
        </span>
      ) : (
        text('setStatus')
      ),
      onOpen: () => setOpen(true),
    },
    ...(open && { dialog: <StatusDialog current={held} onSave={save} onClear={clear} onClose={() => setOpen(false)} /> }),
  }
}
