import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ListDisplayModel, RelatedColumnModel, ResourceModel, ViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { displayValue } from '../../live/display-value'
import { recordTitleField } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { valueColor, valueTone } from '../../live/value-color'
import { toneDots } from '../../primitives/badge'
import { displayRow, type ListDisplayRow } from '../displays/list-displays'
import { AppLink } from '../use-app-address'
import { placeCard } from './card-place'
import { dotCard } from './dot-card'
import { dotsSummary } from './dots-summary'

type RelatedDotsProps = {
  column: RelatedColumnModel
  /** The records of `target` the column shows for the row, in its order, as the list loaded them. */
  records: Array<Record<string, unknown>>
  target: ResourceModel
  view: ViewModel | undefined
  /** Whether the dots wrap onto more lines, as a card's do, over a card whose link takes the pointer between them. */
  wrap?: boolean
  /** Draws the card a dot shows: `RecordCard`, passed in because a card draws dots too. */
  Card: DotCardComponent
}

/** A record's card as `RecordCard` draws it. */
export type DotCardComponent = ComponentType<{ model: ResourceModel; view: ViewModel | undefined; display: Extract<ListDisplayModel, { kind: 'cards' }>; row: ListDisplayRow }>

/** A dot's box and its mark, which a card's room for its dots (`DotsRoom`) takes the size of. */
const dotBox = 'flex shrink-0 items-center justify-center rounded-full p-0.5 pointer-coarse:p-1.5'
const dotMark = 'size-2.5 rounded-full'
const dotsLine = 'flex min-w-0 items-center gap-0.5'

// How long the card stays after the pointer leaves its dot, so it can move onto the card. A touch shows it on a tap
// instead, and keyboard focus as it reaches the dot
const hideMs = 150

const cardWidth = 288

type Shown = { key: string; dot: DOMRect }

/**
 * The card of the dot that is hovered, focused or tapped, portalled to the body: every grid row is its own stacking
 * context and the grid body clips, so a card inside the row would sit under the rows below it.
 */
const DotCardPopover = ({ shown, row, target, view, column, Card, onEnter, onLeave }: { shown: Shown; row: ListDisplayRow; target: ResourceModel; view: ViewModel | undefined; column: RelatedColumnModel; Card: DotCardComponent; onEnter: () => void; onLeave: () => void }) => {
  const card = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number }>()
  useLayoutEffect(() => {
    if (!card.current) return
    setPlace(placeCard(shown.dot, { width: cardWidth, height: card.current.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }))
  }, [shown])
  return createPortal(
    <div ref={card} data-dot-card onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ width: cardWidth, ...(place ?? { visibility: 'hidden', top: 0, left: 0 }) }} className="fixed z-50 rounded-lg shadow-pop">
      <Card model={target} view={view} display={dotCard(view, column.status)} row={row} />
    </div>,
    document.body,
  )
}

/**
 * A related column's cell: a dot per record in the colour its status has in its view, each a link to the record. Hovering
 * or focusing a dot shows the record's card; on a touch screen the first tap shows it, and the card opens the record.
 * The dots say how many records have each status to a screen reader.
 */
export const RelatedDots = ({ column, records, target, view, wrap = false, Card }: RelatedDotsProps) => {
  const rows = useMemo(() => records.map((record) => displayRow(target, record)), [records, target])
  const [shown, setShown] = useState<Shown>()
  const hideTimer = useRef<number>(undefined)
  const pointer = useRef<string>('mouse')
  const box = useRef<HTMLDivElement>(null)

  const status = target.fields[column.status]
  const hints = view?.fields[column.status]
  const statusText = (row: ListDisplayRow) => (status ? displayValue(status, row.record[column.status], hints) : '')
  const titleField = recordTitleField(target, view)
  const title = (row: ListDisplayRow) => row.labels[titleField] ?? String(row.record[titleField] ?? row.key)
  const singular = (view?.names?.singular ?? humanize(target.name)).toLowerCase()
  const plural = (view?.names?.plural ?? humanize(target.name)).toLowerCase()
  const summary = dotsSummary(
    rows.map((row) => row.record[column.status]),
    { values: status?.enumValues ?? [], label: (value) => (status ? displayValue(status, value, hints) : value), singular, plural },
  )

  const cancelHide = () => window.clearTimeout(hideTimer.current)
  const hideSoon = () => {
    cancelHide()
    hideTimer.current = window.setTimeout(() => setShown(undefined), hideMs)
  }
  const show = (key: string, dot: Element) => {
    cancelHide()
    setShown({ key, dot: dot.getBoundingClientRect() })
  }
  useEffect(() => cancelHide, [])

  // The card stays where it was drawn, so scrolling or resizing closes it, and so do Escape and a tap elsewhere
  useEffect(() => {
    if (!shown) return
    const hide = () => setShown(undefined)
    const key = (event: KeyboardEvent) => event.key === 'Escape' && hide()
    const outside = (event: Event) => {
      const target = event.target as Element | null
      if (!box.current?.contains(target) && !target?.closest?.('[data-dot-card]')) hide()
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [shown])

  // A tap on a dot whose card is not open shows the card instead of following the link
  const tap = (key: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (pointer.current !== 'touch' || shown?.key === key) return
    event.preventDefault()
    show(key, event.currentTarget)
  }
  const blur = (event: FocusEvent) => {
    if (!(event.relatedTarget as Element | null)?.closest?.('[data-dot-card]')) hideSoon()
  }
  const shownRow = shown && rows.find((row) => row.key === shown.key)

  return (
    // A click on a dot or its card stays out of the row, which opens its own record
    <div ref={box} className={cn(dotsLine, wrap && 'pointer-events-none flex-wrap')} onClick={(event) => event.stopPropagation()} onPointerDown={(event: PointerEvent) => (pointer.current = event.pointerType)}>
      <span className="sr-only">{summary}</span>
      {rows.map((row) => {
        const value = row.record[column.status]
        const color = valueColor(hints?.valueColors, value)
        return (
          <AppLink
            key={row.key}
            to={{ kind: 'record', resource: target.name, key: row.key }}
            aria-label={`${title(row)}, ${statusText(row)}`}
            onPointerEnter={(event) => event.pointerType !== 'touch' && show(row.key, event.currentTarget)}
            onPointerLeave={(event) => event.pointerType !== 'touch' && hideSoon()}
            onFocus={(event) => event.currentTarget.matches(':focus-visible') && show(row.key, event.currentTarget)}
            onBlur={blur}
            onClick={tap(row.key)}
            className={cn(dotBox, 'pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40')}
          >
            <span aria-hidden style={color === undefined ? undefined : { backgroundColor: color }} className={cn(dotMark, color === undefined && toneDots[valueTone(hints?.valueColors, value)], shown?.key === row.key && 'ring-2 ring-foreground/30')} />
          </AppLink>
        )
      })}
      {shown && shownRow && <DotCardPopover shown={shown} row={shownRow} target={target} view={view} column={column} Card={Card} onEnter={cancelHide} onLeave={hideSoon} />}
    </div>
  )
}

/** Room for `count` dots that wrap as `RelatedDots` with `wrap` does, for a card to hold the dots drawn over it. */
export const DotsRoom = ({ count }: { count: number }) => (
  <span aria-hidden className={cn(dotsLine, 'invisible flex-wrap')}>
    {Array.from({ length: count }, (_, index) => (
      <span key={index} className={dotBox}>
        <span className={dotMark} />
      </span>
    ))}
  </span>
)
