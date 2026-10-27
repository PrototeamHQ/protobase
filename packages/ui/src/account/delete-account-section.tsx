import { useState } from 'react'
import { Button } from '../primitives/button'
import { AccountSection } from './account-section'
import { DeleteAccountDialog } from './delete-account-dialog'
import { text } from './messages'

export type DeleteAccountSectionProps = {
  hasPassword: boolean
  /** Staff signed in as the person, who may not delete their account: the section only says so. */
  staff: boolean
  /** Rejects with `AuthError`, which the dialog shows; resolves once the account is gone and this device signed out. */
  onDelete: (password?: string) => Promise<void>
}

/** Deletes the signed-in person's own account, once they confirm it in a dialog. */
export const DeleteAccountSection = ({ hasPassword, staff, onDelete }: DeleteAccountSectionProps) => {
  const [confirming, setConfirming] = useState(false)
  return (
    <AccountSection title={text('deleteAccount')} description={staff ? text('deleteAccountStaff') : text('deleteAccountDescription')}>
      {!staff && (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {text('deleteAccount')}
        </Button>
      )}
      {confirming && <DeleteAccountDialog hasPassword={hasPassword} onDelete={onDelete} onClose={() => setConfirming(false)} />}
    </AccountSection>
  )
}
