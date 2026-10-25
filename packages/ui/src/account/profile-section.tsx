import { useState } from 'react'
import { AuthError } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { AccountSection, SectionError } from './account-section'
import { text } from './messages'

export type ProfileSectionProps = {
  name: string
  email: string
  /** Rejects with `AuthError`, which the section shows. */
  onRename: (name: string) => Promise<void>
}

/** The signed-in person's name, which they can change, and the address they sign in with. */
export const ProfileSection = ({ name, email, onRename }: ProfileSectionProps) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const rename = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await onRename(draft.trim())
      setEditing(false)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  return (
    <AccountSection title={text('profile')} description={text('profileDescription')}>
      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
        <dt className="text-muted-foreground">{text('name')}</dt>
        <dd className="min-w-0 truncate font-medium">{name}</dd>
        <dt className="text-muted-foreground">{text('email')}</dt>
        <dd className="min-w-0 truncate font-medium">{email}</dd>
      </dl>
      <Button
        onClick={() => {
          setDraft(name)
          setError(undefined)
          setEditing(true)
        }}
      >
        {text('changeName')}
      </Button>
      {editing && (
        <Dialog
          title={text('changeName')}
          description={text('changeNameDescription')}
          onClose={() => setEditing(false)}
          actions={
            <>
              <Button onClick={() => setEditing(false)}>{text('cancel')}</Button>
              <Button variant="primary" loading={busy} disabled={!draft.trim() || draft.trim() === name} onClick={() => void rename()}>
                {text('save')}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1.5 font-medium">
            {text('name')}
            <Input autoFocus value={draft} maxLength={100} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <SectionError message={error} />
        </Dialog>
      )}
    </AccountSection>
  )
}
