import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Checkbox } from '../primitives/checkbox'
import { cn } from '../lib/cn'
import { isRightAligned, type ColumnSpec } from './column-spec'
import { HeaderMenu } from './header-menu'
import { compactGutter, gridTemplate } from './grid-template'

export type HeaderCell = { spec: ColumnSpec; sorted: 'asc' | 'desc' | false; onSort: (event: unknown) => void }

export type GridHeaderProps = {
  cells: HeaderCell[]
  specs: ColumnSpec[]
  gutter: number
  selectedCount: number
  selectable: boolean
  trailing?: number
  minScale?: number
  /** Left offsets of the pinned columns, by id. */
  pins?: Record<string, number>
  /** The pinned column next to the scrolling ones: it gets the edge shadow once the grid scrolls sideways. */
  lastPinned?: string
  scrolled?: boolean
  onTogglePin: (id: string) => void
  onClearSelection: () => void
}

const SortIcon = ({ sorted }: { sorted: HeaderCell['sorted'] }) => {
  if (sorted === 'asc') return <ArrowUp className="size-3 text-foreground" />
  if (sorted === 'desc') return <ArrowDown className="size-3 text-foreground" />
  return <ChevronsUpDown className="size-3 opacity-0 group-hover/head:opacity-100" />
}

export const GridHeader = ({ cells, specs, gutter, selectedCount, selectable, trailing, minScale, pins = {}, lastPinned, scrolled, onTogglePin, onClearSelection }: GridHeaderProps) => (
  <div className="grid h-8 shrink-0 items-center border-b bg-surface text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: gridTemplate(specs, gutter, trailing, minScale) }} role="row">
    <div className={cn('sticky left-0 z-10 flex h-full items-center gap-2 bg-inherit pl-3', scrolled && !lastPinned && 'shadow-[1px_0_0_var(--border),4px_0_6px_-2px_rgb(0_0_0/0.12)]')} style={{ width: gutter }}>
      {selectable && <Checkbox checked={false} indeterminate={selectedCount > 0} label="Clear selection" onChange={onClearSelection} className={cn(selectedCount === 0 && 'opacity-60')} />}
      {gutter > compactGutter && <span className="w-6 text-right text-faint-foreground">#</span>}
    </div>
    {cells.map(({ spec, sorted, onSort }) => {
      const pinned = spec.id in pins
      return (
        <div
          key={spec.id}
          data-col-id={spec.id}
          style={pinned ? { left: pins[spec.id] } : undefined}
          className={cn(
            'group/cell flex h-full min-w-0 items-center',
            pinned && 'sticky z-10 bg-inherit',
            pinned && scrolled && spec.id === lastPinned && 'shadow-[1px_0_0_var(--border),4px_0_6px_-2px_rgb(0_0_0/0.12)]',
            spec.highlight && 'bg-primary-soft text-primary-text',
          )}
        >
          <button
            type="button"
            onClick={onSort}
            disabled={!spec.sortable}
            className={cn('group/head flex h-full min-w-0 flex-1 items-center gap-1 pl-3 pr-1 text-left', isRightAligned(spec.kind) && 'justify-end', spec.sortable && 'hover:text-foreground', sorted && 'text-foreground')}
          >
            <span className="truncate">{spec.header}</span>
            {spec.highlight && <span className="rounded bg-primary px-1 text-[10px] font-semibold uppercase leading-4 text-primary-foreground">New</span>}
            {spec.sortable && <SortIcon sorted={sorted} />}
          </button>
          <div className="pr-1.5">
            <HeaderMenu header={spec.header} pinned={pinned} onTogglePin={() => onTogglePin(spec.id)} />
          </div>
        </div>
      )
    })}
    {trailing ? <div /> : null}
  </div>
)
