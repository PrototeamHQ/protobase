import { useEffect, useRef, useState, type RefObject } from 'react'
import { nativeTabBarState, useNativeTabBar } from './native-tab-bar'
import { tabIcon } from './tab-icon'

/**
 * Draws the bottom bar `nav` as the app's native tab bar, when it has one (`NativeTabBarContext`): its tabs, by their
 * labels and the icons the web bar draws, and the current one, sent whole again whenever they change, and none once
 * the bar goes, as when `/meta` turns it off. Where the app refuses the state, the web bar stays shown. The tab at `search`, when there is one, is search, which the native bar
 * draws as its own. A tap on a native tab clicks the web bar's tab of the same index, so it
 * does what a tap on that one does. While the native bar draws it, `native` is true and `height` the height the native
 * bar tells, the home indicator's inset included, which the web bar then keeps clear, unseen, so the page's content
 * ends above the native bar.
 */
export const useNativeBottomBar = (nav: RefObject<HTMLElement | null>, labels: string[], selected: number, search?: number, icons: string[] = []) => {
  const bar = useNativeTabBar()
  const [refused, setRefused] = useState(false)
  const [height, setHeight] = useState<number>()
  // What the bar shows, by its tabs, their icons (`icons`, each icon's name) and the current one: sent again when it changes
  const key = JSON.stringify({ labels, selected, search, icons })
  // The key the native bar last drew, and the one the web bar now has: a tap counts only while they are the same, so a
  // tap on a tab the native bar still shows never clicks another one the web bar has in its place
  const drawn = useRef<string | undefined>(undefined)
  const latest = useRef(key)
  latest.current = key

  useEffect(() => {
    const element = nav.current
    if (!bar || !element) return
    let current = true
    const pictures = [...element.children].map((tab) => tabIcon(tab.querySelector('svg')))
    void Promise.all(pictures).then((made) => {
      if (!current) return
      // A bar the app refuses to draw leaves the web bar shown, so the tabs are always there
      void bar.set(nativeTabBarState(labels, made, selected, search)).then(
        (told) => {
          if (!current) return
          drawn.current = key
          setRefused(false)
          if (told.height !== undefined) setHeight(told.height)
        },
        () => current && setRefused(true),
      )
    })
    return () => {
      current = false
    }
    // `key` holds the labels and the current tab, which arrive as a new array on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bar, key])

  useEffect(() => {
    if (!bar) return
    return () => void bar.set({ visible: false })
  }, [bar])

  const tabs = useRef(nav)
  tabs.current = nav
  useEffect(
    () =>
      bar?.onTap((index) => {
        if (drawn.current !== latest.current) return
        const tab = tabs.current.current?.children[index] as HTMLElement | undefined
        tab?.click()
      }),
    [bar],
  )

  useEffect(() => bar?.onHeight(setHeight), [bar])

  return { native: Boolean(bar) && !refused, height }
}
