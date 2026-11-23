import { AtSign, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { AuthError, type MailConnectionListing, type MailSender, type MailSenderChange, type MailSenders, type MailSenderVerification } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { senderState } from '../mailbox/sender-state'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { SectionError } from './account-section'
import { MailSenderDialog, type MailSenderInput } from './mail-sender-dialog'
import { ListingNotices } from './listing-notices'
import { text } from './messages'
import { useSenderRefresh } from './use-sender-refresh'

export type MailSendersSectionProps = {
  senders: MailSenders
  /** Each rejects with `AuthError`, which the section shows. */
  onAdd: (input: { address: string; name?: string; signature?: string }) => Promise<MailSender>
  onUpdate: (id: string, change: MailSenderChange) => Promise<unknown>
  onRemove: (id: string) => Promise<void>
  /** Shares an address with the app's other senders, or makes it the person's alone again. */
  onShare: (id: string, shared: boolean) => Promise<unknown>
  /** Starts the app's verifiers on an address (`senders.verifiers`), and reads its latest verifications again. */
  onVerify: (id: string) => Promise<MailSenderVerification[]>
  onVerifications: (id: string) => Promise<MailSenderVerification[]>
  /** Reads the send-as addresses of each mailbox that can list them, and the addresses again; rejects with `AuthError`. */
  onRefresh: () => Promise<MailConnectionListing[]>
  /** Connects the mailbox of a mail provider again, asking for every scope the app adds. */
  onConnect: (provider: string) => void
  /** A mail provider's name, such as Gmail. */
  providerName: (provider: string) => string
}

// Changing an address just added verifies it at once (`autoVerify`).
type Editing = { kind: 'add' } | { kind: 'change'; sender: MailSender; autoVerify?: boolean } | { kind: 'remove'; sender: MailSender }

const detailsOf = (sender: MailSender) => (sender.signature ? text('ownSignature') : text('genericSignature'))

// What the person can do about an address whose mail would not go out from it as they expect, naming the mailbox's
// own address and the button that checks again; an unchecked one on a mailbox that can check only asks for the check.
const hintOf = (sender: MailSender, canCheck: boolean, name: string, own: string) => {
  if (sender.state === 'failed') return text('stateFailedHint', { name, own })
  if (sender.state === 'pending') return text('statePendingHint', { name, address: sender.address })
  if (sender.state === 'detached') return text('stateDetachedHint')
  if (sender.state === 'unverified') return canCheck ? text('stateUnverifiedCheckHint', { name }) : text('stateUnverifiedHint', { name, own })
  return
}

/**
 * The From addresses the person's mail goes out from, under their mailbox: its own and those its provider lists or
 * they typed, such as its send-as addresses, each with its state, and its own signature or the generic one; one is the
 * default, and a verified one can be shared with the app's other senders. Opening it reads the send-as addresses again from each mailbox that can list them, as **Check with Gmail**
 * does; a mailbox whose link lacks the scope to list them offers to connect it again. Where the app has verifiers,
 * adding an address verifies it at once, and its dialog verifies it again; elsewhere the dialog says it cannot.
 */
export const MailSendersSection = ({ senders: { address, senders, verifiers = false, connections = [] }, onAdd, onUpdate, onRemove, onShare, onVerify, onVerifications, onRefresh, onConnect, providerName }: MailSendersSectionProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<Editing>()
  // Set at once, unlike `busy`, so a second click before the next render changes nothing twice.
  const inFlight = useRef(false)
  const chosen = senders.find((sender) => sender.isDefault)
  const listing = connections.filter((connection) => connection.canList)
  const ready = listing.filter((connection) => connection.missingScopes.length === 0)
  const providers = useMemo(() => [...new Set(ready.map((connection) => connection.provider))], [ready.map((connection) => connection.provider).join()])
  const { refreshing, problems, checked, refresh } = useSenderRefresh(onRefresh, ready.length > 0, providers)
  // A link that lacks the scope says so before any refresh, from the list itself.
  const missing = [...new Set(listing.filter((connection) => connection.missingScopes.length > 0).map((connection) => connection.provider))]
  const notices = [...missing.map((provider) => ({ provider, kind: 'not_permitted' as const })), ...problems.filter((problem) => !missing.includes(problem.provider))]

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
        await onUpdate(editing.sender.id, { name, signature, isDefault: input.isDefault })
        // The switch's state is sent on every save, never diffed against what the dialog opened with: after a save that
        // got no answer, that may no longer be what the server holds. Sharing and unsharing are idempotent.
        await onShare(editing.sender.id, input.shared)
        return
      }
      const added = await onAdd({ address: input.address, ...(name && { name }), ...(signature && { signature }) })
      if (input.isDefault) await onUpdate(added.id, { isDefault: true })
      // Checked at once where the mailbox can say, so a typo shows Can't send while the person still remembers typing it.
      if (ready.length > 0) void refresh()
      if (verifiers) return { kind: 'change', sender: { ...added, isDefault: input.isDefault }, autoVerify: true }
    })

  const verificationOf = (sender: MailSender, auto = false) => ({
    available: verifiers,
    calls: { start: () => onVerify(sender.id), read: () => onVerifications(sender.id) },
    ...(auto && { auto }),
  })

  return (
    <div className="mt-5 border-t pt-4">
      <h3 className="font-semibold">{text('fromAddresses')}</h3>
      <p className="mt-1 mb-3 text-muted-foreground">{text('fromAddressesDescription')}</p>
      <SectionError message={editing ? undefined : error} />
      <ListingNotices notices={notices} providerName={providerName} onConnect={onConnect} />
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
          {senders.map((sender) => {
            const state = senderState(sender.state)
            const connection = connections.find((candidate) => candidate.id === sender.connection)
            const canCheck = connection !== undefined && connection.canList && connection.missingScopes.length === 0
            const hint = hintOf(sender, canCheck, providerName(connection?.provider ?? connections[0]?.provider ?? 'gmail'), connection?.address ?? address ?? text('yourMailboxAddress'))
            return (
            <li key={sender.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <AtSign className="size-4 shrink-0 text-muted-foreground" />
              {/* A basis of its own, so on a narrow screen the badges and buttons wrap below the address instead of squeezing it. */}
              <span className="min-w-0 flex-1 basis-48">
                <bdi className="block truncate font-medium">{sender.address}</bdi>
                {sender.name && <bdi className="block truncate">{sender.name}</bdi>}
                <span className="block text-xs text-muted-foreground">{detailsOf(sender)}</span>
              </span>
              <Badge tone={state.tone}>{state.label}</Badge>
              {sender.isDefault && <Badge tone="blue">{text('default')}</Badge>}
              {sender.sharedAt && <Badge tone="neutral">{text('shared')}</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'change', sender })}>
                {text('edit')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'remove', sender })}>
                {text('remove')}
              </Button>
              {hint && <p className="basis-full pl-7 text-xs text-muted-foreground">{hint}</p>}
            </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing({ kind: 'add' })}>
          <Plus className="size-3.5" />
          {text('addFromAddress')}
        </Button>
        {providers.map((provider) => (
          <Button key={provider} variant="ghost" loading={refreshing} onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" />
            {text(refreshing ? 'checkingWithMailbox' : 'checkWithMailbox', { name: providerName(provider) })}
          </Button>
        ))}
        {providers.length > 0 && (
          <p role="status" className="self-center text-xs text-muted-foreground">
            {checked && !refreshing ? text('checkedWithMailbox', { name: providers.map(providerName).join(', ') }) : ''}
          </p>
        )}
      </div>
      {editing?.kind === 'add' && <MailSenderDialog verification={{ available: verifiers }} busy={busy} error={error} onSave={(input) => void save(input)} onClose={close} />}
      {editing?.kind === 'change' && (
        <MailSenderDialog key={editing.sender.id} sender={editing.sender} verification={verificationOf(editing.sender, editing.autoVerify)} busy={busy} error={error} onSave={(input) => void save(input)} onClose={close} />
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
