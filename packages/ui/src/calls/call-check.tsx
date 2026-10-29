import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { hueOf, initialsOf } from '../auth/user-to-shell'
import { cn } from '../lib/cn'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { RouteLink, type RouteTarget } from '../primitives/route-link'
import { text } from './messages'
import { TrackVideo } from './track-media'

export type CallCheckProps = {
  name: string
  member: string
  /** The member's camera as it will be sent, to see before joining. */
  camera?: MediaStreamTrack
  microphoneOn: boolean
  cameraOn: boolean
  /** Whether the browser has a microphone and a camera it may use. */
  microphone: boolean
  cameraAvailable: boolean
  notices: string[]
  onMicrophone: () => void
  onCamera: () => void
  onJoin: () => void
  /** Where the member goes without joining. */
  cancel: RouteTarget
}

const toggle = (on: boolean) => cn('size-10 rounded-full', !on && 'bg-danger-soft text-danger-text')

/**
 * The check of the microphone and camera before joining: the member's own camera as the others will see it, or their
 * initials, microphone and camera on and off, plain messages for a blocked or missing device, and Join.
 */
export const CallCheck = ({ name, member, camera, microphoneOn, cameraOn, microphone, cameraAvailable, notices, onMicrophone, onCamera, onJoin, cancel }: CallCheckProps) => (
  <section aria-label={text('preview')} className="flex size-full min-h-0 flex-col items-center justify-center gap-3 bg-background p-4">
    <figure className="relative flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-lg bg-neutral-900">
      {camera && cameraOn ? <TrackVideo track={camera} aria-label={text('preview')} className="size-full -scale-x-100 object-cover" /> : <Avatar initials={initialsOf(name)} hue={hueOf(member)} size="md" className="size-16 text-xl ring-0" />}
    </figure>
    {notices.length > 0 && (
      <div role="status" className="flex w-full max-w-md flex-col gap-1">
        {notices.map((notice) => (
          <p key={notice} className="rounded-md bg-warning-soft px-3 py-1.5 text-xs text-foreground">
            {notice}
          </p>
        ))}
      </div>
    )}
    <div className="flex items-center gap-2">
      <Button size="icon" aria-label={text('microphone')} aria-pressed={microphoneOn} disabled={!microphone} className={toggle(microphoneOn)} onClick={onMicrophone}>
        {microphoneOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </Button>
      <Button size="icon" aria-label={text('camera')} aria-pressed={cameraOn} disabled={!cameraAvailable} className={toggle(cameraOn)} onClick={onCamera}>
        {cameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
      </Button>
      <Button variant="primary" className="h-10 rounded-full px-5" onClick={onJoin}>
        {text('joinCall')}
      </Button>
      <RouteLink to={cancel} className="px-2 text-sm text-muted-foreground hover:text-foreground">
        {text('leave')}
      </RouteLink>
    </div>
  </section>
)
