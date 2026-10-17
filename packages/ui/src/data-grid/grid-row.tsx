import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { formatInt } from '../format/number'
import { Checkbox } from '../primitives/checkbox'
import { Skeleton } from '../primitives/skeleton'
import { cn } from '../lib/cn'
import { isRightAligned, type ColumnSpec } from './column-spec'
import { compactGutter, gridTemplate } from './grid-template'

type RowFrame = { specs: ColumnSpec[]; gutter: number; index: number; offset: number; height: number; selectable: boolean; trailing?: number; minScale?: number; scrolled?: boolean; pins?: Record<string, number>; lastPinned?: string }

const frameStyle = (frame: RowFrame) => ({
  gridTemplateColumns: gridTemplate(frame.specs, frame.gutter, frame.trailing, frame.minScale),
  height: frame.height,
  transform: `translateY(${frame.offset}px)`,
})

/** Pinned cells need a solid background; `bg-inherit` takes the row's, so hover and selection still show. */
const cellClass = (spec: ColumnSpec, frame: Pick<RowFrame, 'pins' | 'lastPinned' | 'scrolled'>) =>
  cn(
    'flex h-full min-w-0 items-center overflow-hidden whitespace-nowrap px-3',
    isRightAligned(spec.kind) && 'justify-end',
    spec.highlight && 'bg-primary-soft/60',
    frame.pins && spec.id in frame.pins && 'sticky z-10 bg-inherit',
    frame.scrolled && spec.id === frame.lastPinned && 'shadow-[1px_0_0_var(--border),4px_0_6px_-2px_rgb(0_0_0/0.12)]',
  )

const pinStyle = (spec: ColumnSpec, pins?: Record<string, number>) => (pins && spec.id in pins ? { left: pins[spec.id] } : undefined)

/**
 * The selection column never scrolls away, so rows can be selected from anywhere in a wide grid.
 * The whole cell toggles the row instead of opening it; the checkbox's own click bubbles up to it.
 */
const Gutter = ({ width, index, selectable, selected, onToggle, edge }: { width: number; index: number; selectable: boolean; selected?: boolean; onToggle?: () => void; edge?: boolean }) => (
  <div
    onClick={selectable ? (event) => { event.stopPropagation(); onToggle?.() } : undefined}
    className={cn('sticky left-0 z-10 flex h-full items-center gap-2 bg-inherit pl-3', selectable && 'cursor-default', edge && 'shadow-[1px_0_0_var(--border),4px_0_6px_-2px_rgb(0_0_0/0.12)]')}
    style={{ width }}
  >
    {selectable && <Checkbox checked={Boolean(selected)} label={`Select row ${index + 1}`} />}
    {width > compactGutter && <span className="min-w-6 text-right text-[11px] tabular-nums text-faint-foreground">{formatInt(index + 1)}</span>}
  </div>
)

/**
 * A cell of a row: its column and content and, in a grid whose cells are edited in place, its handlers and whether it
 * is the chosen cell, is being edited, or can be.
 */
export type RowCell = { spec: ColumnSpec; content: ReactNode; props?: HTMLAttributes<HTMLDivElement>; chosen?: boolean; editing?: boolean; editable?: boolean }

export type DataRowProps = RowFrame & {
  cells: RowCell[]
  selected: boolean
  onToggle: () => void
  onOpen?: () => void
  menu?: ReactNode
  /** A drag handle in the checkbox's place, for a row moved by hand, with the row's element and its move back. */
  handle?: ReactNode
  rowRef?: Ref<HTMLDivElement>
  transition?: string
  dragging?: boolean
}

export const DataRow = ({ cells, selected, onToggle, onOpen, menu, handle, rowRef, transition, dragging, ...frame }: DataRowProps) => (
  <div
    ref={rowRef}
    role="row"
    onClick={onOpen}
    className={cn('absolute inset-x-0 top-0 grid items-center border-b', selected ? 'bg-primary-soft' : 'bg-background hover:bg-surface', onOpen && 'cursor-pointer', dragging && 'z-30 bg-surface shadow-pop')}
    style={{ ...frameStyle(frame), transition }}
  >
    {handle ? (
      <div className={cn('sticky left-0 z-10 flex h-full items-center bg-inherit pl-1.5', frame.scrolled && !frame.lastPinned && 'shadow-[1px_0_0_var(--border),4px_0_6px_-2px_rgb(0_0_0/0.12)]')} style={{ width: frame.gutter }}>
        {handle}
      </div>
    ) : (
      <Gutter width={frame.gutter} index={frame.index} selectable={frame.selectable} selected={selected} onToggle={onToggle} edge={frame.scrolled && !frame.lastPinned} />
    )}
    {cells.map(({ spec, content, props, chosen, editing, editable }) => (
      <div
        key={spec.id}
        role={props ? 'gridcell' : 'cell'}
        {...props}
        className={cn(
          cellClass(spec, frame),
          props && 'scroll-mb-[calc(var(--pb-sticky-bottom,0px)+3rem)] scroll-mt-[calc(var(--pb-sticky-top,0px)+2rem)] outline-none',
          editable && !editing && 'cursor-default',
          chosen && 'shadow-[inset_0_0_0_2px_var(--primary)]',
          editing && 'z-30 overflow-visible bg-background px-1',
        )}
        style={pinStyle(spec, frame.pins)}
      >
        {content}
      </div>
    ))}
    {/* The menu stays at the right edge while the row scrolls sideways */}
    {menu && <div className="sticky right-0 z-10 flex h-full items-center justify-center bg-inherit">{menu}</div>}
  </div>
)

const skeletonWidths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5']

export const SkeletonRow = (frame: RowFrame) => (
  <div role="row" aria-busy className="absolute inset-x-0 top-0 grid items-center border-b bg-background" style={frameStyle(frame)}>
    <Gutter width={frame.gutter} index={frame.index} selectable={false} edge={frame.scrolled && !frame.lastPinned} />
    {frame.specs.map((spec, column) => (
      <div key={spec.id} className={cellClass(spec, frame)} style={pinStyle(spec, frame.pins)}>
        <Skeleton className={cn('h-2.5', skeletonWidths[(frame.index + column) % skeletonWidths.length], isRightAligned(spec.kind) && 'ml-auto')} />
      </div>
    ))}
  </div>
)
