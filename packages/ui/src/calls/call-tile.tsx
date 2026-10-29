import { MicOff, WifiOff } from 'lucide-react'
import { hueOf, initialsOf } from '../auth/user-to-shell'
import { cn } from '../lib/cn'
import { Avatar } from '../primitives/avatar'
import type { CallPerson } from './call-person'
import { text } from './messages'
import { TrackVideo } from './track-media'

/**
 * One person in a call: their camera, or their initials while it sends nothing; their name, a mark while their
 * microphone is off or their connection is poor, a ring while they speak, and a plain message when the member's
 * browser cannot connect to them. `screen` draws their screen share instead, whole.
 */
export const CallTile = ({ person, screen = false, className }: { person: CallPerson; screen?: boolean; className?: string }) => {
  const track = screen ? person.screen : person.cameraOff ? undefined : person.camera
  const label = screen ? text('sharing', person.self ? text('you') : person.name) : person.self ? `${person.name} (${text('you')})` : person.name
  return (
    <figure
      data-member={person.member}
      data-speaking={person.speaking ? 'true' : undefined}
      aria-label={label}
      className={cn('relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-900 ring-offset-2 ring-offset-background', person.speaking && !screen && 'ring-2 ring-success', className)}
    >
      {track ? (
        <TrackVideo track={track} className={cn('size-full', screen ? 'object-contain' : 'object-cover', person.self && !screen && '-scale-x-100')} />
      ) : (
        <Avatar initials={initialsOf(person.name)} hue={hueOf(person.member)} size="md" className="size-16 text-xl ring-0" />
      )}
      {person.connection === 'failed' && !person.self && (
        <p role="status" className="absolute inset-x-1 top-1 truncate rounded bg-black/70 px-2 py-1 text-center text-xs text-white">
          {text('cannotConnect', person.name)}
        </p>
      )}
      <figcaption className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {!screen && person.microphoneOff && <MicOff role="img" aria-label={text('muted')} className="size-3 shrink-0" />}
        {!screen && person.connection === 'poor' && <WifiOff role="img" aria-label={text('poorConnection')} className="size-3 shrink-0 text-warning" />}
        <span className="truncate">{label}</span>
      </figcaption>
    </figure>
  )
}
