import { useEffect, useRef, type KeyboardEvent } from 'react'
import { menuItemClass } from '../primitives/menu-item'
import { menuKeyTarget } from '../primitives/menu-keys'
import { FilterMenu } from './filter-menu'
import type { MoreItem } from './secondary-filters'

type ItemsProps = { items: MoreItem[]; onPick: (key: string) => void; close: () => void }

const Items = ({ items, onPick, close }: ItemsProps) => {
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => buttons.current[0]?.focus(), [])

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') return close()
    const target = menuKeyTarget(event.key, buttons.current.indexOf(document.activeElement as HTMLButtonElement), items.length)
    if (target === undefined) return
    event.preventDefault()
    buttons.current[target]?.focus()
  }

  return (
    <ul role="menu" aria-label="More filters" onKeyDown={onKeyDown} className="-mx-3 -my-3">
      {items.map((item, index) => (
        <li key={item.key} role="none">
          <button
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              close()
              onPick(item.key)
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The secondary filters the bar does not show yet, in a menu at its end; picking one puts it in the bar. */
export const MoreFiltersMenu = ({ items, onPick }: { items: MoreItem[]; onPick: (key: string) => void }) => {
  if (items.length === 0) return null
  return (
    <FilterMenu label="More filters" activeCount={0}>
      {(close) => <Items items={items} onPick={onPick} close={close} />}
    </FilterMenu>
  )
}
