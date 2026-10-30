import { Check, Copy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CallGuests, CallTrackSource } from '@protobase/client/calls'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { ResponsiveDialog } from '../primitives/responsive-dialog'
import { Segmented } from '../primitives/segmented'
import { text } from './messages'
import type { CallLobby } from './use-call-session'
import { useGuestRequest } from './use-guest-request'

export type CallGuestsPanelProps = {
  lobby: CallLobby
  /** The guests in the call now, by their guest id, with the name they gave. */
  inCall: { guest: string; name: string }[]
  guests: CallGuests
  /** The address a link's token opens for the guest. */
  linkOf: (token: string) => string
  open: boolean
  onClose: () => void
}

const sends: Record<'all' | 'camera' | 'microphone', CallTrackSource[]> = { all: ['camera', 'microphone', 'screen', 'screen-audio'], camera: ['camera', 'microphone'], microphone: ['microphone'] }
// How long a new link lets guests in: until the call ends, or for an hour from now.
const lasting = { call: undefined, hour: 60 * 60 * 1000 } as const

const Row = ({ name, children }: { name: string; children: ReactNode }) => (
  <li className="flex items-center justify-between gap-2 py-1.5">
    <span className="min-w-0 truncate text-sm text-foreground">{name}</span>
    <span className="flex shrink-0 gap-1.5">{children}</span>
  </li>
)

/**
 * A member's guests of the call: who waits in the lobby, to let in or turn away; the guests in the call, to remove; and
 * the guest links, to make, copy and revoke, with what their guests may send. Names show as the guests wrote them.
 */
export const CallGuestsPanel = ({ lobby, inCall, guests, linkOf, open, onClose }: CallGuestsPanelProps) => {
  const [send, setSend] = useState<keyof typeof sends>('camera')
  const [lasts, setLasts] = useState<keyof typeof lasting>('call')
  const [made, setMade] = useState<{ id: string; url: string }>()
  const [copied, setCopied] = useState(false)
  const { run, refused } = useGuestRequest()
  const create = () =>
    run(async () => {
      const ms = lasting[lasts]
      const { link, token } = await guests.link({ publish: sends[send], ...(ms !== undefined && { expiresAt: new Date(Date.now() + ms) }) })
      setMade({ id: link.id, url: linkOf(token) })
    })
  const copy = (url: string) =>
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  return (
    <ResponsiveDialog title={text('guests')} description={text('addressesVisible')} open={open} onClose={onClose} actions={<Button onClick={onClose}>{text('close')}</Button>}>
      <div className="flex flex-col gap-4">
        {refused && (
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-1.5 text-xs text-foreground">
            {text('guestRefused')}
          </p>
        )}
        {lobby.guests.length > 0 && (
          <section aria-label={text('inLobby')}>
            <h3 className="text-xs font-medium text-muted-foreground">{text('inLobby')}</h3>
            <ul>
              {lobby.guests.map(({ guest, name }) => (
                <Row key={guest} name={name}>
                  <Button size="sm" variant="primary" onClick={() => run(() => guests.admit(guest))}>
                    {text('admit')}
                  </Button>
                  <Button size="sm" onClick={() => run(() => guests.deny(guest))}>
                    {text('deny')}
                  </Button>
                </Row>
              ))}
            </ul>
          </section>
        )}
        {inCall.length > 0 && (
          <section aria-label={text('guestsInCall')}>
            <h3 className="text-xs font-medium text-muted-foreground">{text('guestsInCall')}</h3>
            <ul>
              {inCall.map(({ guest, name }) => (
                <Row key={guest} name={name}>
                  <Button size="sm" variant="danger" onClick={() => run(() => guests.remove(guest))}>
                    {text('remove')}
                  </Button>
                </Row>
              ))}
            </ul>
          </section>
        )}
        <section aria-label={text('guestLinks')} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{text('guestLinks')}</h3>
          {lobby.links.length === 0 && <p className="text-sm text-muted-foreground">{text('noLinks')}</p>}
          <ul>
            {lobby.links.map((link) => (
              <li key={link.id} className="flex flex-col gap-1.5 py-1.5">
                {made?.id === link.id && (
                  <Input
                    readOnly
                    value={made.url}
                    aria-label={text('copyLink')}
                    onFocus={(event) => event.currentTarget.select()}
                    trailing={
                      <button type="button" aria-label={copied ? text('copied') : text('copyLink')} onClick={() => copy(made.url)} className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted pointer-coarse:size-11">
                        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                      </button>
                    }
                  />
                )}
                <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  {link.expires_at ? text('linkUntil', { until: new Date(link.expires_at).toLocaleString() }) : text('linkUntilEnd')}
                  <Button size="sm" onClick={() => run(() => guests.revoke(link.id))}>
                    {text('revoke')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-start gap-2">
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {text('guestsMaySend')}
              <Segmented
                label={text('guestsMaySend')}
                value={send}
                onChange={setSend}
                options={[
                  { value: 'all', label: text('sendAll') },
                  { value: 'camera', label: text('sendCamera') },
                  { value: 'microphone', label: text('sendMicrophone') },
                ]}
              />
            </span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {text('linkLasts')}
              <Segmented
                label={text('linkLasts')}
                value={lasts}
                onChange={setLasts}
                options={[
                  { value: 'call', label: text('linkUntilEnd') },
                  { value: 'hour', label: text('forAnHour') },
                ]}
              />
            </span>
            <Button variant="primary" onClick={create}>
              {text('newLink')}
            </Button>
          </div>
        </section>
      </div>
    </ResponsiveDialog>
  )
}
