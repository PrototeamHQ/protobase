import { useCallback, useState, type FormEvent } from 'react'
import { guestCallsPath } from '@protobase/schema/internal'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { CallView } from './call-view'
import { guestAdmission } from './guest-admission'
import { guestCallLink } from './guest-call-link'
import { maxGuestNameLength } from './guest-name-length'
import { text } from './messages'

export type GuestCallPageProps = {
  /** The guest link's token. */
  link: string
  /** The API's system path, such as `/api` or `https://api.example.com/api`. */
  systemPath: string
  /** The app's base, which the guest link is at. */
  base: string
}

/**
 * The page a guest link opens, for someone with no account: their name, then the call view's check of their microphone
 * and camera, Ask to join, the wait in the lobby until someone in the call lets them in, and the call. They reach
 * nothing else of the app: the page asks only the lobby and the guest call socket.
 */
export const GuestCallPage = ({ link, systemPath, base }: GuestCallPageProps) => {
  const [draft, setDraft] = useState('')
  const [name, setName] = useState<string>()
  const [left, setLeft] = useState(false)
  const admission = useCallback(
    async (signal: AbortSignal) => {
      const { guestLobby } = await import('@protobase/client/calls')
      return guestAdmission(guestLobby({ systemPath }), link, name!, signal)
    },
    [systemPath, link, name],
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (draft.trim()) setName(draft.trim())
  }
  const here = guestCallLink(base, link)

  if (left) {
    return (
      <p role="status" className="flex min-h-[100dvh] items-center justify-center bg-background p-4 text-sm text-foreground">
        {text('youLeft')}
      </p>
    )
  }
  if (name === undefined) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-sm text-foreground">{text('guestIntro')}</p>
          <label className="flex flex-col gap-1 text-sm text-foreground">
            {text('yourName')}
            <Input autoFocus autoComplete="name" maxLength={maxGuestNameLength} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            {text('continue')}
          </Button>
        </form>
      </main>
    )
  }
  return (
    <main className="h-[100dvh]">
      <CallView url={guestCallsPath(systemPath, 'socket')} admission={admission} name={name} nameOf={() => text('someone')} leave={{ href: here, onFollow: () => setLeft(true) }} />
    </main>
  )
}
