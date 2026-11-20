import { useEffect, useRef, useState, type RefObject } from 'react'
import { useNativeTopBar, type NativeAccount, type NativeTopBarControl, type NativeTopBarState } from './native-top-bar'

/** Marks the top bar's own controls, which a tap on the native bar's control of the same name clicks. */
export const topBarControl = (control: NativeTopBarControl) => ({ 'data-top-bar-control': control })

/** Marks what the top bar shows beside its own controls, such as the app's actions: while any of it shows, the web bar stays. */
export const topBarActions = { 'data-top-bar-actions': '' }

// Whether anything the app put in the bar takes room on the screen; an action that draws nothing on a phone does not
const showsActions = (header: HTMLElement) => [...header.querySelectorAll('[data-top-bar-actions] *')].some((element) => element.getClientRects().length > 0)

const controlIn = (header: HTMLElement, control: NativeTopBarControl) => header.querySelector<HTMLElement>(`[data-top-bar-control="${control}"]`)

// The account's entry as the bar shows it: the label of its link or button, and the avatar's initials, none for an icon
const accountIn = (header: HTMLElement): NativeAccount | null => {
  const entry = controlIn(header, 'account')
  const target = entry?.querySelector<HTMLElement>('a, button')
  if (!entry || !target) return null
  return { label: target.getAttribute('aria-label') ?? target.textContent?.trim() ?? '', text: entry.textContent?.trim() ?? '' }
}

/**
 * Draws the phone top bar `header` as the app's native top bar, when it has one (`NativeTopBarContext`) and `on`: the
 * page's `title`, the label of the page `back` goes to, the menu's and search's buttons and the account's entry, which the bar's
 * controls marked with `topBarControl` hold, sent whole again whenever they change, and none once the bar goes or is
 * off, as while the phone's search covers it. A tap on a native control clicks the bar's own of the same name, so it
 * does what a tap on that one does. Where the app refuses the state, the web bar stays shown. While the native bar
 * draws it, `native` is true and `height` the height the native bar tells, the status bar included, which the web bar
 * then keeps clear, unseen, so the page's content starts below the native bar.
 */
export const useNativeTopBarFor = (header: RefObject<HTMLElement | null>, on: boolean, title: string, back: string | undefined, menu: boolean, search: boolean) => {
  const bar = useNativeTopBar()
  const [refused, setRefused] = useState(false)
  const [crowded, setCrowded] = useState(false)
  const [height, setHeight] = useState<number>()
  const sent = useRef<string | undefined>(undefined)
  const active = Boolean(bar) && on && !crowded

  // After every render, as the account's entry and the app's actions are read from the bar itself; only a changed state
  // is sent
  useEffect(() => {
    const element = header.current
    if (!bar || !element) return
    const busy = showsActions(element)
    if (busy !== crowded) return setCrowded(busy)
    const state: NativeTopBarState = active ? { visible: true, title, back: back ?? null, menu, search, account: accountIn(element) } : { visible: false }
    const key = JSON.stringify(state)
    if (key === sent.current) return
    sent.current = key
    void bar.set(state).then(
      (told) => {
        setRefused(false)
        if (told.height !== undefined) setHeight(told.height)
      },
      () => active && setRefused(true),
    )
  })

  useEffect(() => {
    if (!bar) return
    return () => void bar.set({ visible: false })
  }, [bar])

  useEffect(
    () =>
      bar?.onTap((control) => {
        const element = header.current && controlIn(header.current, control)
        const target = control === 'account' ? element?.querySelector<HTMLElement>('a, button') : element
        target?.click()
      }),
    [bar, header],
  )

  useEffect(() => bar?.onHeight(setHeight), [bar])

  return { native: active && !refused, height }
}
