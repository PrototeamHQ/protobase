import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, UserPlus, Video, VideoOff } from 'lucide-react'
import { buttonClass, Button } from '../primitives/button'
import { CountBadge } from '../primitives/count-badge'
import { RouteLink, type RouteTarget } from '../primitives/route-link'
import { cn } from '../lib/cn'
import { text } from './messages'

export type CallControlsProps = {
  microphoneOn: boolean
  cameraOn: boolean
  /** Whether the member shares their screen; no share button where the browser cannot share one, as on a phone. */
  sharing?: boolean
  onMicrophone: () => void
  onCamera: () => void
  onShare?: () => void
  /** For a member who may invite: the guests, with how many wait in the lobby. */
  guests?: { waiting: number; onOpen: () => void }
  /** Where Leave goes, such as the record's page without its call: leaving the page leaves the call. */
  leave: RouteTarget
}

const toggle = (on: boolean) => cn('size-10 rounded-full', !on && 'bg-danger-soft text-danger-text')

/** The member's controls: microphone, camera and screen share on and off, the guests, and Leave, a link out of the call. */
export const CallControls = ({ microphoneOn, cameraOn, sharing, onMicrophone, onCamera, onShare, guests, leave }: CallControlsProps) => (
  <div role="toolbar" aria-label={text('joinCall')} className="flex shrink-0 flex-wrap items-center justify-center gap-2 py-2">
    <Button size="icon" aria-label={text('microphone')} aria-pressed={microphoneOn} title={text('microphone')} className={toggle(microphoneOn)} onClick={onMicrophone}>
      {microphoneOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
    </Button>
    <Button size="icon" aria-label={text('camera')} aria-pressed={cameraOn} title={text('camera')} className={toggle(cameraOn)} onClick={onCamera}>
      {cameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
    </Button>
    {onShare && (
      <Button size="icon" aria-label={sharing ? text('stopSharing') : text('shareScreen')} aria-pressed={Boolean(sharing)} title={sharing ? text('stopSharing') : text('shareScreen')} className="size-10 rounded-full" onClick={onShare}>
        {sharing ? <MonitorX className="size-4" /> : <MonitorUp className="size-4" />}
      </Button>
    )}
    {guests && (
      <Button size="icon" aria-label={text('guests')} title={text('guests')} className="relative size-10 rounded-full" onClick={guests.onOpen}>
        <UserPlus className="size-4" />
        <CountBadge count={guests.waiting} className="absolute -top-1 -right-1" />
      </Button>
    )}
    <RouteLink to={leave} className={cn(buttonClass({ variant: 'danger' }), 'h-10 rounded-full px-4')}>
      <PhoneOff className="size-4" />
      {text('leave')}
    </RouteLink>
  </div>
)
