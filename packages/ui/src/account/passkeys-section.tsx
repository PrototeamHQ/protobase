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
import { text } from './messages'

export type PasskeysSectionProps = {
  /** What the sign-in policy says about passkeys. */
  rule: SignInRule
  passkeys: Passkey[]
  /** Each rejects with `AuthError`, which the section shows. */
  onAdd: () => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

const descriptions = { allowed: 'passkeysAllowed', required: 'passkeysRequired', forbidden: 'passkeysForbidden' } as const satisfies Record<SignInRule, string>

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
    <AccountSection title={text('passkeys')} status={rule === 'required' && <Badge tone="blue">{text('required')}</Badge>} description={text(descriptions[rule])}>
      <SectionError message={editing ? undefined : error} />
      {passkeys.length > 0 && (
        <ul className="mb-3 divide-y rounded-md border">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{passkey.name ?? text('passkey')}</span>
                <span className="block text-xs text-muted-foreground">
                  {passkey.createdAt ? text('addedOn', { date: formatDate(Date.parse(passkey.createdAt)) }) : text('addedEarlier')} · {passkey.backedUp ? text('synced') : text('oneDevice')}
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
                  {text('rename')}
                </Button>
                <Button size="sm" variant="ghost" disabled={keepLast} title={keepLast ? text('keepLastPasskey') : undefined} onClick={() => setEditing({ kind: 'remove', passkey })}>
                  {text('remove')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rule !== 'forbidden' && (
        <Button loading={busy && !editing} onClick={() => void attempt(onAdd)}>
          <Plus className="size-3.5" />
          {text('addPasskey')}
        </Button>
      )}
      {editing?.kind === 'rename' && (
        <Dialog
          title={text('renamePasskey')}
          description={text('renamePasskeyDescription')}
          onClose={() => setEditing(undefined)}
          actions={
            <>
              <Button onClick={() => setEditing(undefined)}>{text('cancel')}</Button>
              <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void attempt(() => onRename(editing.passkey.id, name.trim()))}>
                {text('save')}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1.5 font-medium">
            {text('name')}
            <Input autoFocus value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          </label>
          <SectionError message={error} />
        </Dialog>
      )}
      {editing?.kind === 'remove' && (
        <Dialog
          title={text('removePasskey')}
          description={text('removePasskeyDescription', { name: editing.passkey.name ?? text('thisPasskey') })}
          onClose={() => setEditing(undefined)}
          actions={
            <>
              <Button onClick={() => setEditing(undefined)}>{text('cancel')}</Button>
              <Button variant="danger" loading={busy} onClick={() => void attempt(() => onRemove(editing.passkey.id))}>
                {text('remove')}
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
