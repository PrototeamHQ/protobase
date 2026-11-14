import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { useMenuRight, useMenuTop } from './menu-edge'
import { menuKeyTarget } from './menu-keys'
import { RouteLink, type RouteTarget } from './route-link'
import type { SegmentedOption } from './segmented'

/** `onChange` takes the option chosen; with `link` instead, each option is a link to where choosing it leads. */
export type MenuSelectProps<T extends string> = { value: T; options: Array<SegmentedOption<T>>; label: string } & ({ onChange: (value: T) => void; link?: never } | { link: (value: T) => RouteTarget; onChange?: never })

/**
 * The choices of a Segmented switch in a menu, for a row without room for every option: a button with the chosen
 * option's icon and label, opening the options under its right edge, or above it near the bottom of the screen.
 */
export const MenuSelect = <T extends string>({ value, options, onChange, link, label }: MenuSelectProps<T>) => {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<Array<HTMLElement | null>>([])
  const menu = useRef<HTMLUListElement>(null)
  const right = useMenuRight(open, root, menu)
  const top = useMenuTop(open, root, menu, right?.right)
  const chosen = options.findIndex((option) => option.value === value)
  const current = options[chosen]

  useEffect(() => {
    if (!open) return
    // The focus goes to the chosen option when the menu opens, not again when the choice changes
    items.current[Math.max(chosen, 0)]?.focus()
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const closeToTrigger = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'Escape') return closeToTrigger()
    if (event.key === 'Tab') return setOpen(false)
    const target = menuKeyTarget(event.key, items.current.indexOf(document.activeElement as HTMLElement), options.length)
    if (target === undefined) return
    event.preventDefault()
    items.current[target]?.focus()
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={current ? `${label}: ${current.label}` : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-background px-2.5 text-body font-medium shadow-sm transition-colors hover:bg-muted pointer-coarse:h-11"
      >
        {current?.icon && <current.icon className="size-3.5" />}
        {current?.label ?? label}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <ul ref={menu} role="menu" aria-label={label} onKeyDown={onKeyDown} style={{ ...right, ...top }} className="absolute right-0 top-full z-30 mt-1 w-max min-w-40 rounded-md border bg-background py-1 text-body shadow-pop">
          {options.map((option, index) => {
            const item = {
              ref: (element: HTMLElement | null) => {
                items.current[index] = element
              },
              role: 'menuitemradio',
              'aria-checked': option.value === value,
              className: cn('flex min-h-9 w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted focus:bg-muted focus:outline-none pointer-coarse:min-h-11', option.value === value && 'font-medium'),
            }
            const content = (
              <>
                {option.icon ? <option.icon className="size-3.5" /> : <span className="size-3.5" />}
                <span className="flex-1">{option.label}</span>
                {option.value === value && <Check className="size-3.5 text-primary-text" />}
              </>
            )
            return (
              <li key={option.value} role="none">
                {link ? (
                  <RouteLink {...item} to={link(option.value)} onClick={closeToTrigger}>
                    {content}
                  </RouteLink>
                ) : (
                  <button
                    {...item}
                    type="button"
                    onClick={() => {
                      closeToTrigger()
                      if (option.value !== value) onChange(option.value)
                    }}
                  >
                    {content}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
