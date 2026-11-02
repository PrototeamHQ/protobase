import { useState } from 'react'
import { Button } from '../primitives/button'
import { AccountSection } from './account-section'
import { PasswordChangeDialog } from './password-change-dialog'
import { text } from './messages'

export type PasswordSectionProps = {
  /** What the sign-in policy says about passwords: while they are off, the section only says so. */
  rule: 'allowed' | 'forbidden'
  hasPassword: boolean
  /** Staff signed in as the person, who may not change their sign-in: the section only says so. */
  staff: boolean
  /** Each rejects with `AuthError`, which the dialog shows. */
  onChange: (current: string, next: string) => Promise<void>
  onSet: (next: string) => Promise<void>
}

const descriptionOf = ({ rule, hasPassword, staff }: Pick<PasswordSectionProps, 'rule' | 'hasPassword' | 'staff'>) => {
  if (staff) return text('passwordStaff')
  if (rule === 'forbidden') return text('passwordForbidden')
  return hasPassword ? text('passwordIsSet') : text('passwordNotSet')
}

/** The signed-in person's password: change it with the current one, or set a first one without signing anyone out. */
export const PasswordSection = ({ rule, hasPassword, staff, onChange, onSet }: PasswordSectionProps) => {
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const canEdit = !staff && rule === 'allowed'

  return (
    <AccountSection title={text('password')} description={descriptionOf({ rule, hasPassword, staff })}>
      {saved && (
        <p role="status" className="mb-3 font-medium">
          {text('passwordSaved')}
        </p>
      )}
      {canEdit && (
        <Button
          onClick={() => {
            setSaved(false)
            setEditing(true)
          }}
        >
          {hasPassword ? text('changePassword') : text('setPassword')}
        </Button>
      )}
      {editing && (
        <PasswordChangeDialog
          hasPassword={hasPassword}
          onClose={() => setEditing(false)}
          onSave={async ({ current, next }) => {
            await (hasPassword ? onChange(current, next) : onSet(next))
            setEditing(false)
            setSaved(true)
          }}
        />
      )}
    </AccountSection>
  )
}
