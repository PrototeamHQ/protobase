import { Check, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { formatInt } from '../format/number'
import { cn } from '../lib/cn'
import { Token } from '../primitives/token'
import type { FacetGroupConfig } from './filter-config'
import { comboboxOptions, moveActive } from './combobox-options'
import { facetLabel } from './filter-state'
import { text } from './messages'

export type FacetComboboxProps = {
  config: FacetGroupConfig
  selected: string[]
  onToggle: (value: string) => void
  /** Lists the options at all times, for a combobox that is already inside a dropdown menu. */
  inline?: boolean
}

/** Chooses several values of a facet: the choices sit in the box as removable tokens, typing searches the options. */
export const FacetCombobox = ({ config, selected, onToggle, inline = false }: FacetComboboxProps) => {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const open = inline || focused
  const options = comboboxOptions(config, query)

  // A search left behind when the combobox closes would narrow the options the next one starts with
  const onSearch = useRef(config.onSearch)
  onSearch.current = config.onSearch
  useEffect(() => () => onSearch.current?.(''), [])

  const search = (text: string) => {
    setQuery(text)
    setActive(-1)
    config.onSearch?.(text)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(moveActive(active, options.length, event.key))
      return
    }
    if (event.key === 'Enter' && options[active]) {
      event.preventDefault()
      onToggle(options[active].value)
      return
    }
    if (event.key === 'Backspace' && query === '' && selected.length > 0) {
      onToggle(selected[selected.length - 1]!)
      return
    }
    if (event.key === 'Escape' && query !== '') {
      event.stopPropagation()
      search('')
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex min-h-8 cursor-text flex-wrap items-center gap-1 rounded-md border border-border-strong bg-background px-2 py-1 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
        onClick={() => input.current?.focus()}
      >
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        {selected.map((value) => (
          <Token key={value} label={facetLabel(config, value)} onRemove={() => onToggle(value)} />
        ))}
        <input
          ref={input}
          autoFocus={inline}
          role="combobox"
          aria-label={config.label}
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
          placeholder={selected.length > 0 ? '' : text('searchIn', config.label)}
          className="h-6 min-w-16 flex-1 bg-transparent text-foreground outline-none placeholder:text-faint-foreground"
          value={query}
          onChange={(event) => search(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setActive(-1)
            if (!inline && query !== '') search('')
          }}
        />
      </div>
      {open && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label={config.label}
          aria-multiselectable
          className={cn('flex max-h-60 flex-col gap-px overflow-y-auto', !inline && 'rounded-md border bg-background p-1 shadow-sm')}
        >
          {options.map((option, index) => {
            const chosen = selected.includes(option.value)
            return (
              <li
                key={option.value}
                id={`${id}-${index}`}
                role="option"
                aria-selected={chosen}
                tabIndex={-1}
                className={cn('flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-muted', index === active && 'bg-muted')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onToggle(option.value)}
              >
                <span
                  className={cn(
                    'inline-flex size-4 shrink-0 items-center justify-center rounded border',
                    chosen ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong bg-background',
                  )}
                >
                  {chosen && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 truncate">{option.label}</span>
                {option.count !== undefined && <span className="text-xs tabular-nums text-faint-foreground">{formatInt(option.count)}</span>}
              </li>
            )
          })}
          {options.length === 0 && <li className="px-1.5 py-1 text-xs text-faint-foreground">{text('noMatches')}</li>}
        </ul>
      )}
    </div>
  )
}
