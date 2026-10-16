import { Calendar, Columns3, LayoutGrid, List, Map as MapIcon, SquareKanban, Table2, type LucideIcon } from 'lucide-react'
import type { ListDisplayModel, ResourceModel, ViewModel } from '@protobase/schema'
import { cn } from '../../lib/cn'
import { humanize } from '../../live/naming'
import { MenuSelect } from '../../primitives/menu-select'
import { Segmented } from '../../primitives/segmented'
import { parseSort } from '../list-order'
import { displayChoices, sortFields } from './list-displays'

/** The icons a display's `icon` may name; another name shows the label alone. */
const icons: Record<string, LucideIcon> = { table: Table2, cards: LayoutGrid, kanban: SquareKanban, board: Columns3, list: List, calendar: Calendar, map: MapIcon }

/**
 * The list page's switch between the table and the view's displays, as buttons or, on a phone, as a menu; nothing for a
 * list with only its table.
 */
export const DisplaySwitch = ({ view, value, onChange, menu = false }: { view: ViewModel | undefined; value: string; onChange: (display: string) => void; menu?: boolean }) => {
  const choices = displayChoices(view)
  if (choices.length < 2) return null
  const options = choices.map((choice) => ({ value: choice.name, label: choice.label, icon: choice.icon === undefined ? undefined : icons[choice.icon] }))
  if (menu) return <MenuSelect label="Display" value={value} onChange={onChange} options={options} />
  return <Segmented label="Display" size="md" value={value} onChange={onChange} options={options} />
}

const directions = [
  ['asc', 'ascending'],
  ['desc', 'descending'],
] as const

/** The order of a display without column headers, over the sortable fields it shows and the order the list has now. */
export const SortMenu = ({ model, view, display, orderBy, onChange, className }: { model: ResourceModel; view: ViewModel | undefined; display: ListDisplayModel; orderBy: string; onChange: (orderBy: string) => void; className?: string }) => {
  const current = parseSort(orderBy)
  const fields = sortFields(model, view, display)
  const names = fields.includes(current.columnId) ? fields : [current.columnId, ...fields]
  const label = (name: string) => view?.fields[name]?.label ?? humanize(name)
  return (
    <select
      aria-label="Sort"
      value={`${current.columnId} ${current.direction}`}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-8 rounded-md border border-border-strong bg-background px-2.5 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20', className)}
    >
      {names.flatMap((name) =>
        directions.map(([direction, word]) => (
          <option key={`${name} ${direction}`} value={`${name} ${direction}`}>
            {label(name)}, {word}
          </option>
        )),
      )}
    </select>
  )
}
