import { KeySquare, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { AuthError, type NewPersonalAccessToken, type PersonalAccessToken } from '@protobase/client'
import { confirmationMinutes } from '@protobase/schema/internal'
import { ConfirmSignIn } from '../app/confirm-sign-in'
import { authMessage } from '../auth/auth-messages'
import { formatDate } from '../format'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { Select } from '../primitives/select'
import { AccountSection, SectionError } from './account-section'
import { CopyField } from './copy-field'
import { text } from './messages'

export type PersonalAccessTokensSectionProps = {
  tokens: PersonalAccessToken[]
  /** Rejects with `AuthError`, which the section shows, or answers by asking the person to confirm it's them. */
  onCreate: (input: { name: string; expiresInDays?: number }) => Promise<NewPersonalAccessToken>
  /** Rejects with `AuthError`, which the section shows. */
  onRevoke: (id: string) => Promise<void>
}

// The lifetimes offered, in days; `never` makes a token that lasts until it is revoked.
const lifetimes = { '30': 30, '90': 90, '365': 365, never: undefined } as const
type Lifetime = keyof typeof lifetimes
const lifetimeLabels = { '30': 'expiresIn30Days', '90': 'expiresIn90Days', '365': 'expiresInAYear', never: 'neverExpires' } as const

const dateOf = (iso: string) => formatDate(Date.parse(iso))

// When it expires, or expired: a token past its expiry stays listed until it is revoked.
const expiryOf = (expiresAt: string | undefined) => {
  if (!expiresAt) return text('neverExpires')
  return Date.parse(expiresAt) <= Date.now() ? text('expiredOn', { date: dateOf(expiresAt) }) : text('expiresOn', { date: dateOf(expiresAt) })
}

// "Created 1 Aug 2026 · Expires 30 Aug 2026 · Last used 2 Aug 2026 · As Sales in Acme".
const detailsOf = (token: PersonalAccessToken) =>
  [
    text('createdOn', { date: dateOf(token.createdAt) }),
    expiryOf(token.expiresAt),
    token.lastUsedAt ? text('lastUsedOn', { date: dateOf(token.lastUsedAt) }) : text('notUsedYet'),
    token.organization ? text('actsAsIn', { role: token.role, organization: token.organization }) : text('actsAs', { role: token.role }),
  ].join(' · ')

type Editing = { kind: 'create' } | { kind: 'created'; created: NewPersonalAccessToken } | { kind: 'revoke'; token: PersonalAccessToken }

/**
 * The person's personal access tokens, which let a script call the app's API as them: each with when it was made,
 * expires and was last used, and what it acts as, to revoke; and a new one, shown once to copy, since the app keeps
 * only its hash. An older session confirms it's them before a new token, in place.
 */
export const PersonalAccessTokensSection = ({ tokens, onCreate, onRevoke }: PersonalAccessTokensSectionProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<Editing>()
  const [name, setName] = useState('')
  const [lifetime, setLifetime] = useState<Lifetime>('90')
  const [confirming, setConfirming] = useState<'asked' | 'done'>()

  const close = () => {
    setEditing(undefined)
    setError(undefined)
    setConfirming(undefined)
  }

  // Set at once, unlike `busy`, so a second click before the next render makes no second token.
  const inFlight = useRef(false)

  const attempt = async (action: () => Promise<Editing | undefined>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(undefined)
    try {
      setEditing(await action())
      setConfirming(undefined)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      if (failure.code === 'STRONG_SIGN_IN_REQUIRED') setConfirming('asked')
      else setError(authMessage(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const create = () =>
    attempt(async () => {
      const days = lifetimes[lifetime]
      const created = await onCreate({ name: name.trim(), ...(days !== undefined && { expiresInDays: days }) })
      return { kind: 'created', created }
    })

  return (
    <AccountSection title={text('accessTokens')} description={text('accessTokensDescription')}>
      <SectionError message={editing ? undefined : error} />
      {tokens.length === 0 ? (
        <p className="mb-3 text-muted-foreground">{text('noAccessTokens')}</p>
      ) : (
        <ul className="mb-3 divide-y rounded-md border">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <KeySquare className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <bdi className="block truncate font-medium">{token.name}</bdi>
                <span className="block text-xs text-muted-foreground">{detailsOf(token)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'revoke', token })}>
                {text('revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        onClick={() => {
          setName('')
          setLifetime('90')
          setEditing({ kind: 'create' })
        }}
      >
        <Plus className="size-3.5" />
        {text('newAccessToken')}
      </Button>
      {editing?.kind === 'create' && (
        <Dialog
          title={text('newAccessToken')}
          description={text('newAccessTokenDescription')}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{text('cancel')}</Button>
              <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void create()}>
                {text('createAccessToken')}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1.5 font-medium">
            {text('name')}
            <Input autoFocus value={name} maxLength={100} placeholder={text('accessTokenNamePlaceholder')} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="mt-3 flex flex-col gap-1.5 font-medium">
            {text('accessTokenExpiry')}
            <Select value={lifetime} onChange={(event) => setLifetime(event.target.value as Lifetime)}>
              {(Object.keys(lifetimes) as Lifetime[]).map((option) => (
                <option key={option} value={option}>
                  {text(lifetimeLabels[option])}
                </option>
              ))}
            </Select>
          </label>
          {/* Confirming signs the browser in anew or confirms its session; the person then makes the token again. */}
          {confirming === 'asked' && <ConfirmSignIn purpose="change" minutes={confirmationMinutes} onConfirmed={() => setConfirming('done')} />}
          {confirming === 'done' && <p className="mt-2 text-muted-foreground">{text('confirmedCreateAccessToken')}</p>}
          <SectionError message={error} />
        </Dialog>
      )}
      {editing?.kind === 'created' && (
        <Dialog
          title={text('accessTokenCreated', { name: editing.created.personalAccessToken.name })}
          description={text('accessTokenCreatedDescription')}
          onClose={close}
          actions={
            <Button variant="primary" onClick={close}>
              {text('done')}
            </Button>
          }
        >
          <CopyField value={editing.created.token} copyLabel={text('copyAccessToken')} />
        </Dialog>
      )}
      {editing?.kind === 'revoke' && (
        <Dialog
          title={text('revokeAccessToken', { name: editing.token.name })}
          description={text('revokeAccessTokenDescription')}
          onClose={close}
          actions={
            <>
              <Button onClick={close}>{text('cancel')}</Button>
              <Button variant="danger" loading={busy} onClick={() => void attempt(async () => (await onRevoke(editing.token.id), undefined))}>
                {text('revoke')}
              </Button>
            </>
          }
        >
          <SectionError message={error} />
        </Dialog>
      )}
    </AccountSection>
  )
}
