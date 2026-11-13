import { useEffect, useRef, useState } from 'react'
import { firstControl } from './first-control'
import { nextFocus } from './next-focus'
import { text } from './messages'

type Acted = { key: string; action: string; title: string }

// The heading of the section the cards are in, focusable by script
const headingOf = (root: HTMLElement) => {
  const heading = root.closest('section')?.querySelector<HTMLElement>('h2')
  if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1
  return heading
}

/**
 * Where focus goes when an action takes its card out of the list, the cards' `keys` in their order: to the next card's
 * first enabled action, else the previous card's, else the section's heading, while the focus fell to the page with the
 * card; `announcement` then says it left. Cards carry their key in `data-card`, inside `root`; each tells `acted` once one of
 * its actions ran. A card that stays keeps the focus where it is. `keys` is a new list only when the cards reload.
 */
export const useLeavingFocus = (keys: string[]) => {
  const root = useRef<HTMLDivElement>(null)
  const shown = useRef({ current: keys, previous: keys })
  const pending = useRef<Acted>(undefined)
  const [announcement, setAnnouncement] = useState('')

  const settle = (acted: Acted, before: string[], after: string[]) => {
    pending.current = undefined
    if (after.includes(acted.key) || !root.current) return
    setAnnouncement(text('left', { action: acted.action, title: acted.title }))
    // Focus the person moved on with stays where it is
    if (document.activeElement && document.activeElement !== document.body) return
    const key = nextFocus(before, after, acted.key)
    const card = key === undefined ? undefined : root.current.querySelector(`[data-card="${CSS.escape(key)}"]`)
    const target = card ? firstControl<HTMLElement>(card) : headingOf(root.current)
    target?.focus()
  }

  // The list reloads after the action ran, mostly once it told; the list it left is then the one before
  useEffect(() => {
    const before = shown.current.current
    shown.current = { current: keys, previous: before }
    if (pending.current) settle(pending.current, before, keys)
  }, [keys])

  const acted = (key: string, action: string, title: string) => {
    const { current, previous } = shown.current
    if (current.includes(key)) {
      pending.current = { key, action, title }
      return
    }
    settle({ key, action, title }, previous, current)
  }

  return { root, acted, announcement }
}
