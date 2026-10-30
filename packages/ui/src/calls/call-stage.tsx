import type { ReactNode } from 'react'
import { Spinner } from '../primitives/spinner'
import { cn } from '../lib/cn'
import { CallControls, type CallControlsProps } from './call-controls'
import { callLayout, type CallLayout } from './call-layout'
import type { CallPerson } from './call-person'
import { CallTile } from './call-tile'
import { text } from './messages'
import { TrackAudio } from './track-media'
import { useWidth } from './use-width'

export type CallStageProps = {
  /** Everyone in the call, the member too, in the order they came. */
  people: CallPerson[]
  /** `resuming` while the link to the server is restored; media keeps flowing meanwhile. */
  state: 'joining' | 'joined' | 'resuming'
  /** Plain messages for the member, such as a blocked camera. */
  notices?: string[]
  controls: CallControlsProps
  /** Above the people, such as who waits in the lobby. */
  aside?: ReactNode
  /** Drawn with the stage, such as a dialog it opens. */
  children?: ReactNode
  className?: string
}

// The most people the strip beside a screen share shows; the rest are a count.
const stripMax = 4

const Grid = ({ people, columns }: { people: CallPerson[]; columns: number }) => (
  <div className="grid size-full min-h-0 gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.ceil(people.length / columns)}, minmax(0, 1fr))` }}>
    {people.map((person) => (
      <CallTile key={person.member} person={person} />
    ))}
  </div>
)

const Share = ({ people, sharer, narrow }: { people: CallPerson[]; sharer: CallPerson; narrow: boolean }) => {
  const shown = people.slice(0, stripMax)
  const more = people.length - shown.length
  return (
    <div className={cn('flex size-full min-h-0 gap-2', narrow ? 'flex-col' : 'flex-row')}>
      <CallTile person={sharer} screen className="min-h-0 flex-1" />
      <div className={cn('flex shrink-0 gap-2', narrow ? 'h-20 flex-row' : 'w-40 flex-col')}>
        {shown.map((person) => (
          <CallTile key={person.member} person={person} className={narrow ? 'aspect-video h-full' : 'aspect-video w-full'} />
        ))}
        {more > 0 && <p className="flex items-center justify-center rounded-lg bg-muted px-2 text-xs text-muted-foreground">+{more}</p>}
      </div>
    </div>
  )
}

const Tiles = ({ layout, people, narrow }: { layout: CallLayout; people: CallPerson[]; narrow: boolean }) => {
  if (layout.kind === 'share') return <Share people={people} sharer={people.find((person) => person.member === layout.sharer)!} narrow={narrow} />
  if (layout.kind === 'grid') return <Grid people={people} columns={layout.columns} />
  return (
    <div className="relative size-full min-h-0">
      <CallTile person={people[0]!} className="size-full" />
      <p className="absolute inset-x-0 top-3 text-center text-sm text-white drop-shadow">{text('alone')}</p>
    </div>
  )
}

/**
 * A call as the member sees it, filling its parent: everyone at the same size, with the one speaking ringed; a screen
 * share large with the people beside it, or under it on a phone; the member alone; then the controls. The others'
 * sound plays unseen.
 */
export const CallStage = ({ people, state, notices = [], controls, aside, children, className }: CallStageProps) => {
  const { ref, width } = useWidth<HTMLDivElement>()
  const narrow = width > 0 && width < 640
  const layout = callLayout({ people: people.length, sharers: people.filter((person) => person.screen).map((person) => person.member), width })
  const messages = [...(state === 'resuming' ? [text('reconnecting')] : []), ...notices]
  return (
    <section ref={ref} aria-label={text('joinCall')} data-layout={layout.kind} className={cn('flex size-full min-h-0 flex-col gap-2 bg-background p-2', className)}>
      {messages.length > 0 && (
        <div role="status" className="flex shrink-0 flex-col gap-1">
          {messages.map((message) => (
            <p key={message} className="flex items-center gap-2 rounded-md bg-warning-soft px-3 py-1.5 text-xs text-foreground">
              {message === text('reconnecting') && <Spinner className="size-3" />}
              {message}
            </p>
          ))}
        </div>
      )}
      {aside}
      <div className="min-h-0 flex-1">
        {state === 'joining' ? (
          <p role="status" className="flex size-full items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="size-4" />
            {text('connecting')}
          </p>
        ) : (
          <Tiles layout={layout} people={people} narrow={narrow} />
        )}
      </div>
      <CallControls {...controls} />
      {people
        .filter((person) => !person.self)
        .flatMap((person) => [['microphone', person.microphone] as const, ['screen-audio', person.screenAudio] as const].map(([source, track]) => track && { key: `${person.member} ${source}`, track }))
        .filter((audio) => audio !== undefined)
        .map(({ key, track }) => (
          <TrackAudio key={key} track={track} />
        ))}
      {children}
    </section>
  )
}
