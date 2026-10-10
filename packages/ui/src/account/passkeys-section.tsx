import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { AuthError, type Passkey, type SignInRule } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { formatDate } from '../format'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { AccountSection, SectionError } from './account-section'

export type PasskeysSectionProps = {
  /** What the sign-in policy says about passkeys. */
  rule: SignInRule
  passkeys: Passkey[]
  /** Each rejects with `AuthError`, which the section shows. */
  onAdd: () => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

const descriptions: Record<SignInRule, string> = {
  allowed: 'Sign in with Face ID, Touch ID, Windows Hello, your phone or a security key instead of a password.',
  required: 'This app requires a passkey for every account. Sign in with Face ID, Touch ID, Windows Hello, your phone or a security key.',
  forbidden: 'Your admin turned passkeys off for this app, so they cannot be used to sign in.',
}

type Editing = { kind: 'rename'; passkey: Passkey } | { kind: 'remove'; passkey: Passkey }

export const PasskeysSection = ({ rule, passkeys, onAdd, onRename, onRemove }: PasskeysSectionProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<Editing>()
  const [name, setName] = useState('')
  const keepLast = rule === 'required' && passkeys.length <= 1

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      setEditing(undefined)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  return (
    <AccountSection title="Passkeys" status={rule === 'required' && <Badge tone="blue">Required</Badge>} description={descriptions[rule]}>
      <SectionError message={editing ? undefined : error} />
      {passkeys.length > 0 && (
        <ul className="mb-3 divide-y rounded-md border">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{passkey.name ?? 'Passkey'}</span>
                <span className="block text-xs text-muted-foreground">
                  {passkey.createdAt ? `Added ${formatDate(Date.parse(passkey.createdAt))}` : 'Added earlier'} · {passkey.backedUp ? 'Synced across your devices' : 'On one device'}
                </span>
              </span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setName(passkey.name ?? '')
                    setEditing({ kind: 'rename', passkey })
                  }}
                >
                  Rename
                </Button>
                <Button size="sm" variant="ghost" disabled={keepLast} title={keepLast ? 'Passkeys are required: add another one before removing this one.' : undefined} onClick={() => setEditing({ kind: 'remove', passkey })}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rule !== 'forbidden' && (
        <Button loading={busy && !editing} onClick={() => void attempt(onAdd)}>
          <Plus className="size-3.5" />
          Add a passkey
        </Button>
      )}
      {editing?.kind === 'rename' && (
        <Dialog
          title="Rename passkey"
          description="A name that tells you where this passkey lives, such as the device or password manager."
          onClose={() => setEditing(undefined)}
          actions={
            <>
              <Button onClick={() => setEditing(undefined)}>Cancel</Button>
              <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void attempt(() => onRename(editing.passkey.id, name.trim()))}>
                Save
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Name
            <Input autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          </label>
          <SectionError message={error} />
        </Dialog>
      )}
      {editing?.kind === 'remove' && (
        <Dialog
          title="Remove passkey?"
          description={`${editing.passkey.name ?? 'This passkey'} will no longer sign you in here. It stays on the device until you delete it there.`}
          onClose={() => setEditing(undefined)}
          actions={
            <>
              <Button onClick={() => setEditing(undefined)}>Cancel</Button>
              <Button variant="danger" loading={busy} onClick={() => void attempt(() => onRemove(editing.passkey.id))}>
                Remove
              </Button>
            </>
          }
        >
          {error && <SectionError message={error} />}
        </Dialog>
      )}
    </AccountSection>
  )
}
