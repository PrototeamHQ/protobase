import { Laptop, ShieldUser, Smartphone, Tablet } from 'lucide-react'
import { useState } from 'react'
import { AuthError, type DeviceLink, type DeviceSession } from '@protobase/client'
import { authMessage } from '../auth/auth-messages'
import { formatDateTime } from '../format'
import { Badge } from '../primitives/badge'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { AccountSection, SectionError } from './account-section'
import { deviceOf } from './device-name'
import { text } from './messages'

export type DevicesSectionProps = {
  sessions: DeviceSession[]
  /** The operator provider's name, which names a staff session; `undefined` when the app has none. */
  operator?: string
  /** The devices the platform links, each listed once with the sessions it began. */
  links?: DeviceLink[]
  /** Each rejects with `AuthError`, which the section shows. */
  onSignOut: (token: string) => Promise<void>
  onSignOutOthers: () => Promise<void>
  /** Signs a linked device out for good. */
  onSignOutLink?: (id: string) => Promise<void>
}

// A linked device is named by its provider and, when its token gave one, its own name.
const linkName = (link: DeviceLink) => (link.device ? text('deviceThrough', { device: link.device, provider: link.name }) : link.name)

// A staff session is named for the operator alone: the person sees that its staff signed in and when, not who.
const nameOf = (session: DeviceSession, operator: string | undefined) => {
  if (session.staff) return operator ? text('staffOf', { operator }) : text('staff')
  const { browser, system } = deviceOf(session.userAgent)
  if (browser && system) return text('browserOn', { browser, system })
  if (system) return text('aBrowserOn', { system })
  return browser ?? text('unknownDevice')
}

const iconOf = (session: DeviceSession) => {
  if (session.staff) return ShieldUser
  const { system } = deviceOf(session.userAgent)
  if (system === 'iPhone' || system === 'Android') return Smartphone
  if (system === 'iPad') return Tablet
  return Laptop
}

// This device first, then the newest sign-in.
const ordered = (sessions: DeviceSession[]) => [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt))

type Confirming = { kind: 'one'; session: DeviceSession } | { kind: 'link'; link: DeviceLink } | { kind: 'others' }

const titleOf = (what: Confirming, operator: string | undefined) => {
  if (what.kind === 'one') return text('signOutDevice', { name: nameOf(what.session, operator) })
  if (what.kind === 'link') return text('signOutDevice', { name: linkName(what.link) })
  return text('signOutOthersTitle')
}

const descriptionOf = (what: Confirming) => text(what.kind === 'one' ? 'signOutDeviceDescription' : what.kind === 'link' ? 'signOutLinkedDeviceDescription' : 'signOutOthersDescription')

/**
 * The devices signed in to the person's account, this one marked, each other one of which they can sign out; and the
 * devices the platform links, each of which they can sign out for good, with the sessions it began.
 */
export const DevicesSection = ({ sessions: all, operator, links = [], onSignOut, onSignOutOthers, onSignOutLink }: DevicesSectionProps) => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState<Confirming>()
  // A linked device's sessions show as that device.
  const sessions = all.filter((session) => !links.some((link) => link.sessions.includes(session.token)))
  const others = all.filter((session) => !session.current)

  const run = (what: Confirming) => {
    if (what.kind === 'one') return onSignOut(what.session.token)
    if (what.kind === 'link') return onSignOutLink!(what.link.id)
    return onSignOutOthers()
  }

  const signOut = async (what: Confirming) => {
    setBusy(true)
    setError(undefined)
    try {
      await run(what)
      setConfirming(undefined)
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure
      setError(authMessage(failure))
    }
    setBusy(false)
  }

  const open = (what: Confirming) => {
    setError(undefined)
    setConfirming(what)
  }

  return (
    <AccountSection title={text('devices')} description={text('devicesDescription')}>
      {sessions.length === 0 && links.length === 0 ? (
        <p className="text-muted-foreground">{text('noDevices')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {ordered(sessions).map((session) => {
            const Icon = iconOf(session)
            return (
              <li key={session.token} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <bdi className="truncate font-medium">{nameOf(session, operator)}</bdi>
                    {session.current && <Badge tone="green">{text('thisDevice')}</Badge>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {text('signedInFromUntil', { from: formatDateTime(Date.parse(session.createdAt)), until: formatDateTime(Date.parse(session.expiresAt)) })}
                    {!session.staff && session.ipAddress && ` · ${session.ipAddress}`}
                  </span>
                </span>
                {!session.current && (
                  <Button size="sm" variant="ghost" onClick={() => open({ kind: 'one', session })}>
                    {text('signOut')}
                  </Button>
                )}
              </li>
            )
          })}
          {links.map((link) => {
            const current = all.some((session) => session.current && link.sessions.includes(session.token))
            return (
              <li key={link.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <bdi className="truncate font-medium">{linkName(link)}</bdi>
                    {current && <Badge tone="green">{text('thisDevice')}</Badge>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{text('linkedOn', { date: formatDateTime(Date.parse(link.linkedAt)) })}</span>
                </span>
                {!current && onSignOutLink && (
                  <Button size="sm" variant="ghost" onClick={() => open({ kind: 'link', link })}>
                    {text('signOut')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {others.length > 0 && (
        <Button className="mt-3" onClick={() => open({ kind: 'others' })}>
          {text('signOutOthers')}
        </Button>
      )}
      {confirming && (
        <Dialog
          title={titleOf(confirming, operator)}
          description={descriptionOf(confirming)}
          onClose={() => setConfirming(undefined)}
          actions={
            <>
              <Button onClick={() => setConfirming(undefined)}>{text('cancel')}</Button>
              <Button variant="danger" loading={busy} onClick={() => void signOut(confirming)}>
                {text('signOut')}
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
