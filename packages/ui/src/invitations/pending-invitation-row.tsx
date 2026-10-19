import { useState } from 'react'
import { SectionError } from '../account/account-section'
import { useAction } from '../organizations/use-action'
import { Button } from '../primitives/button'
import { LinkNotice } from './link-notice'

export type PendingInvitationRowProps = {
  email: string
  /** What the invitation gives, in words: its roles. */
  gives: string
  expiresAt: string
  /** Sends it again with a new link, which replaces the earlier one; answers the link when the app cannot email it. */
  onResend: () => Promise<{ link?: string }>
  onRevoke: () => Promise<void>
}

/** An invitation not accepted yet: to whom, what it gives and until when, with Send again and Revoke. */
export const PendingInvitationRow = ({ email, gives, expiresAt, onResend, onRevoke }: PendingInvitationRowProps) => {
  const [link, setLink] = useState<string>()
  const { busy, error, run } = useAction()
  const expired = new Date(expiresAt).getTime() < Date.now()
  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{email}</span>
          <span className="block text-xs text-muted-foreground">
            {gives} · {expired ? 'Expired' : `Until ${new Date(expiresAt).toLocaleDateString()}`}
          </span>
        </span>
        <Button size="sm" loading={busy} onClick={() => void run(async () => setLink((await onResend()).link))}>Send again</Button>
        <Button size="sm" variant="danger" loading={busy} onClick={() => void run(onRevoke)}>Revoke</Button>
      </div>
      <SectionError message={error} />
      <LinkNotice link={link} />
    </li>
  )
}
