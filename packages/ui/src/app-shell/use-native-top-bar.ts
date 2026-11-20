import { useEffect, useRef, useState, type RefObject } from 'react'
import { hexColor } from './css-color'
import { useNativeTopBar, type NativeAccount, type NativeTopBarColors, type NativeTopBarControl, type NativeTopBarState } from './native-top-bar'
import { tabIcon } from './tab-icon'

/** Marks the top bar's own controls, which a tap on the native bar's control of the same name clicks. */
export const topBarControl = (control: NativeTopBarControl) => ({ 'data-top-bar-control': control })

/** Marks what the top bar shows beside its own controls, such as the app's and the page's actions, which the native bar shows as its own buttons. */
export const topBarActions = { 'data-top-bar-actions': '' }

const controlIn = (header: HTMLElement, control: NativeTopBarControl) => header.querySelector<HTMLElement>(`[data-top-bar-control="${control}"]`)

// The account's entry as the bar shows it: the label of its link or button, and the avatar's initials, none for an icon
const accountIn = (header: HTMLElement): NativeAccount | null => {
  const entry = controlIn(header, 'account')
  const target = entry?.querySelector<HTMLElement>('a, button')
  if (!entry || !target) return null
  return { label: target.getAttribute('aria-label') ?? target.textContent?.trim() ?? '', text: entry.textContent?.trim() ?? '' }
}

// The links and buttons the app and the page put in the bar that take room on the screen, in order
const actionsIn = (header: HTMLElement) => [...header.querySelectorAll<HTMLElement>('[data-top-bar-actions] :is(a, button)')].filter((element) => element.getClientRects().length > 0)

// A painted colour, none for a transparent one
const painted = (color: string) => {
  const hex = hexColor(color)
  return hex && !hex.endsWith('00') ? hex : null
}

// The web bar's colours: its background, its text, and the account avatar's circle and initials
const colorsIn = (header: HTMLElement): NativeTopBarColors => {
  const entry = controlIn(header, 'account')
  const circle = entry && [...entry.querySelectorAll('*')].find((element) => painted(getComputedStyle(element).backgroundColor))
  return {
    background: painted(getComputedStyle(header).backgroundColor),
    foreground: painted(getComputedStyle(header.firstElementChild ?? header).color),
    avatar: circle ? painted(getComputedStyle(circle).backgroundColor) : null,
    avatarText: circle ? painted(getComputedStyle(circle).color) : null,
  }
}

/**
 * Draws the phone top bar `header` as the app's native top bar, when it has one (`NativeTopBarContext`) and `on`: the
 * page's `title`, the label of the page `back` goes to, the menu's and search's buttons, the app's and the page's
 * actions (`topBarActions`), the account's entry, which the bar's controls marked with `topBarControl` hold, and the
 * bar's colours, sent whole again whenever they change, and none once the bar goes or is off, as while the phone's
 * search covers it. A tap on a native control clicks the bar's own of the same name, or the action in the same place,
 * so it does what a tap on that one does. Where the app refuses the state, the web bar stays shown. While the native
 * bar draws it, `native` is true and `height` the height the native bar tells, the status bar included, which the web
 * bar then keeps clear, unseen, so the page's content starts below the native bar.
 */
export const useNativeTopBarFor = (header: RefObject<HTMLElement | null>, on: boolean, title: string, back: string | undefined, menu: boolean, search: boolean) => {
  const bar = useNativeTopBar()
  const [refused, setRefused] = useState(false)
  const [height, setHeight] = useState<number>()
  const sent = useRef<string | undefined>(undefined)
  const active = Boolean(bar) && on
  // The latest way to send the bar, which a change inside the bar that draws no render here calls too
  const sync = useRef(() => {})
  sync.current = () => {
    const element = header.current
    if (!bar || !element) return
    const actions = active ? actionsIn(element) : []
    void Promise.all(actions.map((action) => tabIcon(action.querySelector('svg')))).then((icons) => {
      const state: NativeTopBarState = active
        ? { visible: true, title, back: back ?? null, menu, search, actions: actions.map((action, at) => ({ label: action.getAttribute('aria-label') ?? action.textContent?.trim() ?? '', icon: icons[at] ?? null })), account: accountIn(element), colors: colorsIn(element) }
        : { visible: false }
      const key = JSON.stringify(state)
      if (key === sent.current) return
      sent.current = key
      bar.set(state).then(
        (told) => {
          setRefused(false)
          if (told.height !== undefined) setHeight(told.height)
        },
        () => active && setRefused(true),
      )
    })
  }

  // After every render, as the account's entry and the actions are read from the bar itself; only a changed state is sent
  useEffect(() => sync.current())

  // A page's actions come into the bar's slot from elsewhere, with no render of the bar
  useEffect(() => {
    const element = header.current
    if (!bar || !element) return
    const observer = new MutationObserver(() => sync.current())
    observer.observe(element, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [bar, header])

  useEffect(() => {
    if (!bar) return
    return () => void bar.set({ visible: false })
  }, [bar])

  useEffect(() => {
    if (!bar) return
    const stopTaps = bar.onTap((control) => {
      const element = header.current && controlIn(header.current, control)
      const target = control === 'account' ? element?.querySelector<HTMLElement>('a, button') : element
      target?.click()
    })
    const stopActions = bar.onAction((index) => header.current && actionsIn(header.current)[index]?.click())
    return () => {
      stopTaps()
      stopActions()
    }
  }, [bar, header])

  useEffect(() => bar?.onHeight(setHeight), [bar])

  return { native: active && !refused, height }
}
