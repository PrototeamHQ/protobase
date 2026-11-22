import { AtSign, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { AuthError, type MailSender, type MailSenderChange, type MailSenderCheck, type MailSenders } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { SectionError } from './account-section'
import { MailSenderDialog, type MailSenderInput } from './mail-sender-dialog'
import { text } from './messages'

export type MailSendersSectionProps = {
  senders: MailSenders
  /** Each rejects with `AuthError`, which the section shows. */
  onAdd: (input: { address: string; name?: string; signature?: string }) => Promise<MailSender>
  onUpdate: (id: string, change: MailSenderChange) => Promise<unknown>
  onRemove: (id: string) => Promise<void>
  /** Sends a test message from an address, and asks where that check stands (`senders.checks`). */
  onCheck: (id: string) => Promise<MailSenderCheck>
  onCheckResult: (id: string, check: string) => Promise<MailSenderCheck>
}

// Changing an address just added checks it at once (`autoCheck`).
type Editing = { kind: 'add' } | { kind: 'change'; sender: MailSender; autoCheck?: boolean } | { kind: 'remove'; sender: MailSender }

const detailsOf = (sender: MailSender) => (sender.signature ? text('ownSignature') : text('genericSignature'))

/**
 * The From addresses the person's mail goes out from, under their mailbox: its own and those they entered once, such
 * as its send-as addresses, each with its own signature or the generic one; one is the default. Where the app can
 * check addresses, adding one sends a test message from it at once to see the From it arrives with, and its dialog
 * checks it again; elsewhere the dialog says it cannot.
 */
export const MailSendersSection = ({ senders: { address, senders, checks = false }, onAdd, onUpdate, onRemove, onCheck, onCheckResult }: MailSendersSectionProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<Editing>()
  // Set at once, unlike `busy`, so a second click before the next render changes nothing twice.
  const inFlight = useRef(false)
  const chosen = senders.find((sender) => sender.isDefault)

  const close = () => {
    setEditing(undefined)
    setError(undefined)
  }

  // What the action answers is the dialog to show next, if any.
  const attempt = async (action: () => Promise<Editing | void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(undefined)
    try {
      setEditing((await action()) || undefined)
    } catch (failure) {
      // The browser's fetch rejects with a TypeError when the connection fails, before or after the server acted.
      if (failure instanceof TypeError) return setError(text('noAnswerFromServer'))
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  // An empty name drops the address's name, and an empty signature its own, so the generic one applies.
  const save = (input: MailSenderInput) =>
    attempt(async () => {
      const name = input.name || null
      const signature = input.signature.trim() ? input.signature : null
      if (editing?.kind === 'change') {
        const sharing = input.shared !== editing.sender.shared ? { shared: input.shared } : {}
        return void (await onUpdate(editing.sender.id, { name, signature, isDefault: input.isDefault, ...sharing }))
      }
      const added = await onAdd({ address: input.address, ...(name && { name }), ...(signature && { signature }) })
      if (input.isDefault) await onUpdate(added.id, { isDefault: true })
      if (checks) return { kind: 'change', sender: { ...added, isDefault: input.isDefault }, autoCheck: true }
    })

  const checkOf = (sender: MailSender, auto = false) => ({
    available: checks,
    calls: { start: () => onCheck(sender.id), result: (check: string) => onCheckResult(sender.id, check) },
    ...(auto && { auto }),
  })

  return (
    <div className="mt-5 border-t pt-4">
      <h3 className="font-semibold">{text('fromAddresses')}</h3>
      <p className="mt-1 mb-3 text-muted-foreground">{text('fromAddressesDescription')}</p>
      <SectionError message={editing ? undefined : error} />
      {(address || senders.length > 0) && (
        <ul className="mb-3 divide-y rounded-md border">
          {address && (
            <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <AtSign className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <bdi className="block truncate font-medium">{address}</bdi>
                <span className="block text-xs text-muted-foreground">{text('mailboxOwnAddress')}</span>
              </span>
              {chosen ? (
                <Button size="sm" variant="ghost" loading={busy} onClick={() => void attempt(async () => void (await onUpdate(chosen.id, { isDefault: false })))}>
                  {text('makeDefault')}
                </Button>
              ) : (
                <Badge tone="blue">{text('default')}</Badge>
              )}
            </li>
          )}
          {senders.map((sender) => (
            <li key={sender.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <AtSign className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <bdi className="block truncate font-medium">{sender.address}</bdi>
                {sender.name && <bdi className="block truncate">{sender.name}</bdi>}
                <span className="block text-xs text-muted-foreground">{detailsOf(sender)}</span>
              </span>
              {sender.shared && <Badge>{text('sharedFromAddress')}</Badge>}
              {sender.isDefault && <Badge tone="blue">{text('default')}</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'change', sender })}>
                {text('edit')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'remove', sender })}>
                {text('remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={() => setEditing({ kind: 'add' })}>
        <Plus className="size-3.5" />
        {text('addFromAddress')}
      </Button>
      {editing?.kind === 'add' && <MailSenderDialog check={{ available: checks }} busy={busy} error={error} onSave={(input) => void save(input)} onClose={close} />}
      {editing?.kind === 'change' && (
        <MailSenderDialog key={editing.sender.id} sender={editing.sender} check={checkOf(editing.sender, editing.autoCheck)} busy={busy} error={error} onSave={(input) => void save(input)} onClose={close} />
      )}
      {editing?.kind === 'remove' && (
        <Dialog
          title={text('removeFromAddress', { address: editing.sender.address })}
          description={text('removeFromAddressDescription')}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{text('cancel')}</Button>
              <Button variant="danger" loading={busy} onClick={() => void attempt(() => onRemove(editing.sender.id))}>
                {text('remove')}
              </Button>
            </>
          }
        >
          <SectionError message={error} />
        </Dialog>
      )}
    </div>
  )
}
